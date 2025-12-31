// Background sync endpoint for fetching activity streams (HR, power, etc.)
// Separate from main sync to handle the extra API calls needed per activity
import type { Context } from "@netlify/functions";
import {
  withAuth,
  jsonResponse,
  jsonResponseWithCookies,
  parseTokensFromCookies,
} from "./lib/strava.js";
import {
  getActivitiesWithoutStreams,
  upsertActivityStreams,
  getStreamsSyncProgress,
  getActivityById,
} from "./lib/db.js";
import {
  getValidAccessToken,
  fetchActivityStreams,
  shouldPauseForRateLimit,
  activityMightHaveStreams,
  type RateLimitInfo,
} from "./lib/strava-api.js";

// How many activities to process per request (each needs an API call)
const ACTIVITIES_PER_REQUEST = 10;

// GET /api/sync-streams - Get streams sync status
// POST /api/sync-streams - Sync streams for activities that don't have them
export default async function handler(request: Request, _context: Context) {
  // For GET requests, return sync status
  if (request.method === "GET") {
    const cookieHeader = request.headers.get("cookie");
    const { athleteId } = parseTokensFromCookies(cookieHeader);

    if (!athleteId) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const progress = await getStreamsSyncProgress(athleteId);

    return jsonResponse({
      streams: progress,
      percentComplete: progress.total > 0
        ? Math.round((progress.withStreams / progress.total) * 100)
        : 100,
    }, 200);
  }

  // POST - Sync streams for activities that need them
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

    // Get activities that need streams
    const activityIds = await getActivitiesWithoutStreams(athleteId, ACTIVITIES_PER_REQUEST);

    if (activityIds.length === 0) {
      const progress = await getStreamsSyncProgress(athleteId);
      return jsonResponseWithCookies(
        {
          status: "completed",
          message: "All activities have streams synced",
          streams: progress,
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
        const progress = await getStreamsSyncProgress(athleteId);
        return jsonResponseWithCookies(
          {
            status: "paused",
            reason: "rate_limit",
            synced,
            skipped,
            remaining: activityIds.length - synced - skipped,
            rateLimit: lastRateLimit,
            streams: progress,
          },
          newCookies
        );
      }

      // Get activity details to check if it might have streams
      const activity = await getActivityById(activityId);
      if (!activity || !activityMightHaveStreams(activity.data)) {
        // Mark as having empty streams to avoid re-checking
        await upsertActivityStreams(activityId, athleteId, {}, []);
        skipped++;
        continue;
      }

      // Fetch streams from Strava
      const result = await fetchActivityStreams(activityId, validToken);

      if (!result) {
        console.error(`Sync-streams: Failed to fetch streams for activity ${activityId}`);
        skipped++;
        continue;
      }

      lastRateLimit = result.rateLimit;

      // Store streams even if empty (to mark as synced)
      await upsertActivityStreams(
        activityId,
        athleteId,
        result.streams,
        result.streamTypes
      );

      synced++;
    }

    const progress = await getStreamsSyncProgress(athleteId);
    const hasMore = progress.pending > 0;

    return jsonResponseWithCookies(
      {
        status: hasMore ? "in_progress" : "completed",
        synced,
        skipped,
        hasMore,
        rateLimit: lastRateLimit,
        streams: progress,
      },
      newCookies
    );
  });
}

