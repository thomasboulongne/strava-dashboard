// Smart sync endpoint - only syncs activities we're missing
// Webhooks keep us up-to-date, so this is primarily for initial import
// or recovering from missed webhooks
import type { Context } from "@netlify/functions";
import {
  withAuth,
  jsonResponse,
  jsonResponseWithCookies,
  parseTokensFromCookies,
} from "./lib/strava.js";
import {
  getActivityCount,
  getLatestActivityDate,
  hasActivity,
  upsertActivity,
  getStreamsSyncProgress,
  getLapsSyncProgress,
} from "./lib/db.js";
import {
  getValidAccessToken,
  fetchActivitiesPage,
  shouldPauseForRateLimit,
  type RateLimitInfo,
} from "./lib/strava-api.js";

// How many activities to fetch per page (max 200)
const ACTIVITIES_PER_PAGE = 200;

// GET /api/sync - Get sync status and check if sync is needed
// POST /api/sync - Sync missing activities only
export default async function handler(request: Request, _context: Context) {
  const cookieHeader = request.headers.get("cookie");
  const { athleteId } = parseTokensFromCookies(cookieHeader);

  if (!athleteId) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  // For GET requests, return sync status
  if (request.method === "GET") {
    const activityCount = await getActivityCount(athleteId);
    const latestActivityDate = await getLatestActivityDate(athleteId);
    const streamsProgress = await getStreamsSyncProgress(athleteId);
    const lapsProgress = await getLapsSyncProgress(athleteId);

    return jsonResponse({
      activityCount,
      latestActivityDate,
      streams: streamsProgress,
      laps: lapsProgress,
      // No more sync jobs - sync is now stateless and on-demand
      syncJob: null,
    }, 200);
  }

  // POST - Check if sync is needed and sync missing activities
  return withAuth(request, async (_req, _accessToken, newCookies) => {
    // Get valid access token (might need refresh)
    const validToken = await getValidAccessToken(athleteId);
    if (!validToken) {
      return jsonResponseWithCookies(
        { error: "Could not get valid access token", status: "failed" },
        newCookies
      );
    }

    const ourLatestDate = await getLatestActivityDate(athleteId);
    let totalSynced = 0;
    let lastRateLimit: RateLimitInfo | null = null;
    let checkedCount = 0;
    let foundExisting = false;

    // Fetch activities from Strava, starting from most recent
    // Stop when we find an activity we already have (means we're up to date)
    let currentPage = 1;
    const maxPagesPerRequest = 3; // Limit per invocation to avoid timeout

    while (currentPage <= maxPagesPerRequest && !foundExisting) {
      const result = await fetchActivitiesPage(validToken, currentPage, ACTIVITIES_PER_PAGE);

      if (!result) {
        return jsonResponseWithCookies(
          { error: `Failed to fetch page ${currentPage}`, status: "failed" },
          newCookies
        );
      }

      lastRateLimit = result.rateLimit;

      // Check rate limits
      if (result.activities.length === 0 && shouldPauseForRateLimit(result.rateLimit)) {
        return jsonResponseWithCookies(
          {
            status: "paused",
            reason: "rate_limit",
            totalSynced,
            rateLimit: lastRateLimit,
          },
          newCookies
        );
      }

      // No more activities from Strava
      if (result.activities.length === 0) {
        break;
      }

      // Process activities - stop when we find one we already have
      for (const activity of result.activities) {
        const activityId = activity.id as number;
        const activityDate = activity.start_date as string;
        checkedCount++;

        // If we have a latest date and this activity is older, we're done
        // (assuming Strava returns activities in chronological order, newest first)
        if (ourLatestDate && activityDate <= ourLatestDate) {
          // Double-check we actually have this activity
          const exists = await hasActivity(activityId);
          if (exists) {
            foundExisting = true;
            break;
          }
        }

        // We don't have this activity - save it
        await upsertActivity(activityId, athleteId, activity, activityDate);
        totalSynced++;
      }

      // If we didn't find an existing activity but got fewer than a full page,
      // we've reached the end of the user's activities
      if (!foundExisting && result.activities.length < ACTIVITIES_PER_PAGE) {
        break;
      }

      // Check rate limits before next page
      if (shouldPauseForRateLimit(result.rateLimit)) {
        return jsonResponseWithCookies(
          {
            status: "paused",
            reason: "rate_limit",
            totalSynced,
            rateLimit: lastRateLimit,
          },
          newCookies
        );
      }

      currentPage++;
    }

    // Determine if there might be more to sync
    // If we hit the page limit without finding existing activity, there might be more
    const hasMore = !foundExisting && currentPage > maxPagesPerRequest;

    const activityCount = await getActivityCount(athleteId);

    return jsonResponseWithCookies(
      {
        status: hasMore ? "in_progress" : "completed",
        totalSynced,
        checkedCount,
        hasMore,
        foundExisting,
        activityCount,
        rateLimit: lastRateLimit,
      },
      newCookies
    );
  });
}
