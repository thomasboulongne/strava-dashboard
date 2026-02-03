// Background sync endpoint for fetching activity laps
// Fetches detailed activity data from Strava to get lap information
import type { Context } from "@netlify/functions";
import {
  withAuth,
  jsonResponse,
  jsonResponseWithCookies,
  parseTokensFromCookies,
} from "./lib/strava.js";
import {
  getActivitiesForAthlete,
  upsertActivityLapsBatch,
  getLapsForActivity,
  getActivityCount,
} from "./lib/db.js";
import {
  getValidAccessToken,
  fetchActivityWithLaps,
  extractLaps,
  shouldPauseForRateLimit,
  type RateLimitInfo,
} from "./lib/strava-api.js";

// How many activities to process per request (each needs an API call)
const ACTIVITIES_PER_REQUEST = 10;

interface LapsSyncProgress {
  total: number;
  withLaps: number;
  pending: number;
}

async function getLapsSyncProgress(athleteId: number): Promise<LapsSyncProgress> {
  const { getDb } = await import("./lib/db.js");
  const sql = getDb();

  // Count total activities
  const totalResult = await sql`
    SELECT COUNT(*) as count
    FROM activities
    WHERE athlete_id = ${athleteId}
  `;

  // Count activities with laps
  const withLapsResult = await sql`
    SELECT COUNT(DISTINCT activity_id) as count
    FROM activity_laps
    WHERE athlete_id = ${athleteId}
  `;

  const total = parseInt(totalResult[0].count as string, 10);
  const withLaps = parseInt(withLapsResult[0].count as string, 10);

  return {
    total,
    withLaps,
    pending: total - withLaps,
  };
}

async function getActivitiesWithoutLaps(
  athleteId: number,
  limit: number = 50
): Promise<number[]> {
  const { getDb } = await import("./lib/db.js");
  const sql = getDb();

  // Get activity IDs that don't have laps yet
  const result = await sql`
    SELECT a.id
    FROM activities a
    LEFT JOIN activity_laps l ON a.id = l.activity_id
    WHERE a.athlete_id = ${athleteId}
      AND l.activity_id IS NULL
    ORDER BY a.start_date DESC
    LIMIT ${limit}
  `;

  return result.map((r) => r.id as number);
}

// GET /api/sync-laps - Get laps sync status
// POST /api/sync-laps - Sync laps for activities that don't have them
export default async function handler(request: Request, _context: Context) {
  // For GET requests, return sync status
  if (request.method === "GET") {
    const cookieHeader = request.headers.get("cookie");
    const { athleteId } = parseTokensFromCookies(cookieHeader);

    if (!athleteId) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const progress = await getLapsSyncProgress(athleteId);

    return jsonResponse({
      laps: progress,
      percentComplete: progress.total > 0
        ? Math.round((progress.withLaps / progress.total) * 100)
        : 100,
    }, 200);
  }

  // POST - Sync laps for activities that need them
  return withAuth(request, async (_req, _accessToken, newCookies) => {
    const cookieHeader = request.headers.get("cookie");
    const { athleteId } = parseTokensFromCookies(cookieHeader);

    if (!athleteId) {
      return jsonResponse({ error: "No athlete ID in cookies" }, 400);
    }

    // Get valid access token
    const validToken = await getValidAccessToken(athleteId);
    if (!validToken) {
      return jsonResponseWithCookies(
        { error: "Could not get valid access token" },
        newCookies
      );
    }

    // Get activities that need laps
    const activityIds = await getActivitiesWithoutLaps(athleteId, ACTIVITIES_PER_REQUEST);

    if (activityIds.length === 0) {
      const progress = await getLapsSyncProgress(athleteId);
      return jsonResponseWithCookies(
        {
          status: "completed",
          message: "All activities have laps synced",
          laps: progress,
        },
        newCookies
      );
    }

    let synced = 0;
    let skipped = 0;
    let lastRateLimit: RateLimitInfo | null = null;

    for (const activityId of activityIds) {
      // Check if we should pause for rate limits
      if (lastRateLimit && shouldPauseForRateLimit(lastRateLimit)) {
        const progress = await getLapsSyncProgress(athleteId);
        return jsonResponseWithCookies(
          {
            status: "paused",
            reason: "rate_limit",
            synced,
            skipped,
            remaining: activityIds.length - synced - skipped,
            rateLimit: lastRateLimit,
            laps: progress,
          },
          newCookies
        );
      }

      // Fetch detailed activity with laps from Strava
      const result = await fetchActivityWithLaps(activityId, validToken);

      if (!result) {
        console.error(`Sync-laps: Failed to fetch activity ${activityId}`);
        // Mark as processed by inserting empty lap record (to avoid re-checking)
        skipped++;
        continue;
      }

      lastRateLimit = result.rateLimit;

      // Extract and save laps
      const laps = extractLaps(result.activity, athleteId);
      if (laps && laps.length > 0) {
        await upsertActivityLapsBatch(laps);
        synced++;
      } else {
        // Activity has no laps, mark as processed
        skipped++;
      }
    }

    const progress = await getLapsSyncProgress(athleteId);
    const hasMore = progress.pending > 0;

    return jsonResponseWithCookies(
      {
        status: hasMore ? "in_progress" : "completed",
        synced,
        skipped,
        hasMore,
        rateLimit: lastRateLimit,
        laps: progress,
      },
      newCookies
    );
  });
}
