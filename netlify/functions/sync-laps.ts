// Recent-window activity enrichment job.
// Fully enriches recent activities (DetailedActivity + laps + all streams +
// Strava zones) via the shared enrichActivity() helper. Older activities are
// enriched on-demand from the MCP server instead of here.
//
// The route is still /api/sync-laps for backwards compatibility with the
// dashboard's continuation loop; the response keeps the `laps` progress shape
// (now backed by enrichment progress) and adds a richer `details` field.
import type { Context } from "@netlify/functions";
import {
  withAuth,
  jsonResponse,
  jsonResponseWithCookies,
  parseTokensFromCookies,
} from "./lib/strava.js";
import {
  getActivitiesNeedingDetail,
  getDetailSyncProgress,
} from "./lib/db.js";
import {
  getValidAccessToken,
  shouldPauseForRateLimit,
  type RateLimitInfo,
} from "./lib/strava-api.js";
import { enrichActivity, enrichWindowAfter } from "./lib/enrich.js";

// How many activities to enrich per request (each needs ~3 API calls).
const ACTIVITIES_PER_REQUEST = 8;

// Map the windowed enrichment progress into the legacy `laps` progress shape
// (total/withLaps/pending) the dashboard already understands.
function asLapsProgress(p: { total: number; synced: number; pending: number }) {
  return { total: p.total, withLaps: p.synced, pending: p.pending };
}

// GET /api/sync-laps - enrichment status for the recent window
// POST /api/sync-laps - enrich a batch of recent activities that need it
export default async function handler(request: Request, _context: Context) {
  const after = enrichWindowAfter();

  if (request.method === "GET") {
    const cookieHeader = request.headers.get("cookie");
    const { athleteId } = parseTokensFromCookies(cookieHeader);

    if (!athleteId) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const progress = await getDetailSyncProgress(athleteId, after);

    return jsonResponse(
      {
        laps: asLapsProgress(progress),
        details: progress,
        window_after: after,
        percentComplete:
          progress.total > 0
            ? Math.round((progress.synced / progress.total) * 100)
            : 100,
      },
      200,
    );
  }

  // POST - enrich activities that still need detail within the recent window
  return withAuth(request, async (_req, _accessToken, newCookies) => {
    const cookieHeader = request.headers.get("cookie");
    const { athleteId } = parseTokensFromCookies(cookieHeader);

    if (!athleteId) {
      return jsonResponse({ error: "No athlete ID in cookies" }, 400);
    }

    const validToken = await getValidAccessToken(athleteId);
    if (!validToken) {
      return jsonResponseWithCookies(
        { error: "Could not get valid access token" },
        newCookies,
      );
    }

    const activityIds = await getActivitiesNeedingDetail(
      athleteId,
      after,
      ACTIVITIES_PER_REQUEST,
    );

    if (activityIds.length === 0) {
      const progress = await getDetailSyncProgress(athleteId, after);
      return jsonResponseWithCookies(
        {
          status: "completed",
          message: "All recent activities are fully enriched",
          laps: asLapsProgress(progress),
          details: progress,
        },
        newCookies,
      );
    }

    let synced = 0;
    let skipped = 0;
    let lastRateLimit: RateLimitInfo | null = null;

    for (const activityId of activityIds) {
      if (lastRateLimit && shouldPauseForRateLimit(lastRateLimit)) {
        const progress = await getDetailSyncProgress(athleteId, after);
        return jsonResponseWithCookies(
          {
            status: "paused",
            reason: "rate_limit",
            synced,
            skipped,
            remaining: activityIds.length - synced - skipped,
            rateLimit: lastRateLimit,
            laps: asLapsProgress(progress),
            details: progress,
          },
          newCookies,
        );
      }

      const result = await enrichActivity(activityId, athleteId, validToken);
      if (result.rateLimit) lastRateLimit = result.rateLimit;

      if (result.ok) {
        synced++;
      } else {
        console.error(`Sync-enrich: Failed to enrich activity ${activityId}`);
        skipped++;
      }
    }

    const progress = await getDetailSyncProgress(athleteId, after);
    const hasMore = progress.pending > 0;

    return jsonResponseWithCookies(
      {
        status: hasMore ? "in_progress" : "completed",
        synced,
        skipped,
        hasMore,
        rateLimit: lastRateLimit,
        laps: asLapsProgress(progress),
        details: progress,
      },
      newCookies,
    );
  });
}
