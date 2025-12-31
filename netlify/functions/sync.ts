// Background sync endpoint for fetching activities from Strava
// Handles rate limiting and progressive sync for new users
import type { Context } from "@netlify/functions";
import {
  withAuth,
  jsonResponse,
  jsonResponseWithCookies,
  parseTokensFromCookies,
} from "./lib/strava.js";
import {
  getActiveSyncJob,
  getSyncJob,
  createSyncJob,
  updateSyncJob,
  markSyncJobComplete,
  markSyncJobFailed,
  markSyncJobPaused,
  upsertActivity,
  getActivityCount,
  getStreamsSyncProgress,
} from "./lib/db.js";
import {
  getValidAccessToken,
  fetchActivitiesPage,
  shouldPauseForRateLimit,
  type RateLimitInfo,
} from "./lib/strava-api.js";

// How many activities to fetch per page (max 200)
const ACTIVITIES_PER_PAGE = 200;

// GET /api/sync - Get sync status
// POST /api/sync - Trigger or continue sync
export default async function handler(request: Request, _context: Context) {
  // For GET requests, return sync status (doesn't need full auth)
  if (request.method === "GET") {
    const cookieHeader = request.headers.get("cookie");
    const { athleteId } = parseTokensFromCookies(cookieHeader);

    if (!athleteId) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const syncJob = await getSyncJob(athleteId);
    const activityCount = await getActivityCount(athleteId);
    const streamsProgress = await getStreamsSyncProgress(athleteId);

    return jsonResponse({
      syncJob: syncJob
        ? {
            id: syncJob.id,
            status: syncJob.status,
            currentPage: syncJob.current_page,
            totalActivitiesSynced: syncJob.total_activities_synced,
            lastError: syncJob.last_error,
            startedAt: syncJob.started_at,
            completedAt: syncJob.completed_at,
          }
        : null,
      activityCount,
      streams: streamsProgress,
    }, 200);
  }

  // POST - Trigger or continue sync
  return withAuth(request, async (_req, accessToken, newCookies) => {
    const cookieHeader = request.headers.get("cookie");
    const { athleteId } = parseTokensFromCookies(cookieHeader);

    if (!athleteId) {
      return jsonResponse({ error: "No athlete ID in cookies" }, 400);
    }

    // Check for existing active sync job
    let syncJob = await getActiveSyncJob(athleteId);

    // If no active job, create one
    if (!syncJob) {
      syncJob = await createSyncJob(athleteId);
    }

    // If job is pending, mark it as in progress
    if (syncJob.status === "pending") {
      await updateSyncJob(syncJob.id, { status: "in_progress" });
    }

    // Get valid access token (might need refresh)
    const validToken = await getValidAccessToken(athleteId);
    if (!validToken) {
      await markSyncJobFailed(syncJob.id, "Could not get valid access token");
      return jsonResponseWithCookies(
        { error: "Could not get valid access token", syncJob },
        newCookies
      );
    }

    let currentPage = syncJob.current_page;
    let totalSynced = syncJob.total_activities_synced;
    let hasMorePages = true;
    let lastRateLimit: RateLimitInfo | null = null;

    // Fetch activities in batches
    // We'll process multiple pages per request, but check rate limits after each
    const maxPagesPerRequest = 5; // Process up to 5 pages per function invocation
    let pagesProcessed = 0;

    while (hasMorePages && pagesProcessed < maxPagesPerRequest) {
      const result = await fetchActivitiesPage(validToken, currentPage);

      if (!result) {
        await markSyncJobFailed(syncJob.id, `Failed to fetch page ${currentPage}`);
        return jsonResponseWithCookies(
          {
            error: `Failed to fetch page ${currentPage}`,
            syncJob: { ...syncJob, status: "failed" },
          },
          newCookies
        );
      }

      lastRateLimit = result.rateLimit;

      // Check if we got rate limited
      if (result.activities.length === 0 && shouldPauseForRateLimit(result.rateLimit)) {
        await markSyncJobPaused(syncJob.id, currentPage, totalSynced);
        return jsonResponseWithCookies(
          {
            status: "paused",
            reason: "rate_limit",
            rateLimit: lastRateLimit,
            syncJob: {
              ...syncJob,
              status: "paused",
              current_page: currentPage,
              total_activities_synced: totalSynced,
            },
          },
          newCookies
        );
      }

      // Process activities
      for (const activity of result.activities) {
        await upsertActivity(
          activity.id as number,
          athleteId,
          activity,
          activity.start_date as string
        );
        totalSynced++;
      }

      // Check if we've reached the end
      if (result.activities.length < ACTIVITIES_PER_PAGE) {
        hasMorePages = false;
      } else {
        currentPage++;
        pagesProcessed++;

        // Check rate limits before next page
        if (shouldPauseForRateLimit(result.rateLimit)) {
          await markSyncJobPaused(syncJob.id, currentPage, totalSynced);
          return jsonResponseWithCookies(
            {
              status: "paused",
              reason: "rate_limit",
              rateLimit: lastRateLimit,
              syncJob: {
                ...syncJob,
                status: "paused",
                current_page: currentPage,
                total_activities_synced: totalSynced,
              },
            },
            newCookies
          );
        }
      }
    }

    // Update sync job status
    if (!hasMorePages) {
      await markSyncJobComplete(syncJob.id, totalSynced);
      return jsonResponseWithCookies(
        {
          status: "completed",
          totalSynced,
          syncJob: {
            ...syncJob,
            status: "completed",
            total_activities_synced: totalSynced,
          },
        },
        newCookies
      );
    }

    // More pages to process, save progress
    await updateSyncJob(syncJob.id, {
      status: "in_progress",
      current_page: currentPage,
      total_activities_synced: totalSynced,
    });

    return jsonResponseWithCookies(
      {
        status: "in_progress",
        currentPage,
        totalSynced,
        hasMore: true,
        rateLimit: lastRateLimit,
        syncJob: {
          ...syncJob,
          status: "in_progress",
          current_page: currentPage,
          total_activities_synced: totalSynced,
        },
      },
      newCookies
    );
  });
}

