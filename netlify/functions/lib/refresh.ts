// Recent-metadata refresh: re-fetch the DetailedActivity JSON for recently
// created activities and overwrite the stored blob. This is how we pick up
// owner-only edits that Strava never delivers via webhooks - most importantly
// `private_note`, but also `description` and renames made after upload.
//
// Unlike enrichActivity() this is deliberately lightweight: it only re-fetches
// the activity detail (1 API call each) and does NOT re-pull laps/streams/zones,
// which never change for an already-synced activity. upsertActivity() overwrites
// only the `data` blob and leaves detail_synced/laps_synced untouched.
//
// Shared by the manual refresh endpoint, the scheduled cron, and the MCP server.
import {
  getRecentActivityIds,
  tryClaimMetadataRefresh,
  upsertActivity,
} from "./db.js";
import {
  fetchActivity,
  getValidAccessToken,
  shouldPauseForRateLimit,
  type RateLimitInfo,
} from "./strava-api.js";

// Rolling window (in days) of recent activities we keep fresh. Notes are almost
// always added within a day or two of an upload, so a short window is enough.
export const REFRESH_WINDOW_DAYS = Number(process.env.REFRESH_WINDOW_DAYS) || 14;

// Safety cap on how many activities a single refresh pass will re-fetch.
export const REFRESH_MAX_ACTIVITIES =
  Number(process.env.REFRESH_MAX_ACTIVITIES) || 60;

// Minimum gap between on-demand (MCP-triggered) refreshes for one athlete.
const MCP_REFRESH_THROTTLE_SECONDS =
  Number(process.env.MCP_REFRESH_THROTTLE_SECONDS) || 15 * 60;

// MCP refreshes use a tighter window/cap to keep tool-call latency low.
const MCP_REFRESH_WINDOW_DAYS =
  Number(process.env.MCP_REFRESH_WINDOW_DAYS) || 10;
const MCP_REFRESH_MAX_ACTIVITIES =
  Number(process.env.MCP_REFRESH_MAX_ACTIVITIES) || 30;

// ISO date (YYYY-MM-DD) marking the start of the refresh window.
export function refreshWindowAfter(days: number = REFRESH_WINDOW_DAYS): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export interface RefreshResult {
  refreshed: number;
  failed: number;
  // True if we stopped early because we were approaching Strava's rate limit.
  paused: boolean;
  rateLimit: RateLimitInfo | null;
}

// Re-fetch a single activity's DetailedActivity JSON and overwrite the stored
// blob. Returns whether the fetch succeeded plus the freshest rate-limit view.
export async function refreshActivityDetail(
  activityId: number,
  athleteId: number,
  accessToken: string,
): Promise<{ ok: boolean; rateLimit: RateLimitInfo | null }> {
  const result = await fetchActivity(activityId, accessToken);
  if (!result) return { ok: false, rateLimit: null };
  await upsertActivity(
    activityId,
    athleteId,
    result.data,
    result.data.start_date as string,
  );
  return { ok: true, rateLimit: result.rateLimit };
}

// Re-fetch metadata for the athlete's recent activities. Stops early if we get
// close to the rate limit so we never blow through the athlete's Strava quota.
export async function refreshRecentMetadata(
  athleteId: number,
  accessToken: string,
  options: { days?: number; limit?: number } = {},
): Promise<RefreshResult> {
  const after = refreshWindowAfter(options.days ?? REFRESH_WINDOW_DAYS);
  const limit = options.limit ?? REFRESH_MAX_ACTIVITIES;
  const ids = await getRecentActivityIds(athleteId, after, limit);

  let refreshed = 0;
  let failed = 0;
  let paused = false;
  let rateLimit: RateLimitInfo | null = null;

  for (const id of ids) {
    const result = await refreshActivityDetail(id, athleteId, accessToken);
    if (result.rateLimit) rateLimit = result.rateLimit;
    if (result.ok) refreshed++;
    else failed++;

    if (rateLimit && shouldPauseForRateLimit(rateLimit)) {
      paused = true;
      break;
    }
  }

  return { refreshed, failed, paused, rateLimit };
}

// Throttled, self-contained refresh for the MCP server. Atomically claims the
// refresh slot (so concurrent tool calls don't stampede), resolves a valid
// token, and refreshes a small recent window. Returns null when skipped (either
// throttled or no valid token). Never throws - callers treat it as best-effort.
export async function maybeRefreshRecentMetadata(
  athleteId: number,
): Promise<RefreshResult | null> {
  try {
    const claimed = await tryClaimMetadataRefresh(
      athleteId,
      MCP_REFRESH_THROTTLE_SECONDS,
    );
    if (!claimed) return null;

    const token = await getValidAccessToken(athleteId);
    if (!token) return null;

    return await refreshRecentMetadata(athleteId, token, {
      days: MCP_REFRESH_WINDOW_DAYS,
      limit: MCP_REFRESH_MAX_ACTIVITIES,
    });
  } catch (err) {
    console.error(`[refresh] maybeRefreshRecentMetadata failed:`, err);
    return null;
  }
}
