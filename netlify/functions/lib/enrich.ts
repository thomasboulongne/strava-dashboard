// Shared activity enrichment: fetch the full DetailedActivity plus its laps,
// streams (all types), and Strava's per-activity zone distribution, and persist
// everything. This is the single source of truth used by the webhook, the
// recent-window backfill job, and on-demand enrichment from the MCP server.
import {
  upsertActivity,
  upsertActivityLapsBatch,
  deleteActivityLaps,
  markActivityLapsSynced,
  upsertActivityStreams,
  deleteActivityStreams,
  upsertActivityZones,
  markActivityDetailSynced,
} from "./db.js";
import {
  fetchActivity,
  fetchActivityStreams,
  fetchActivityZones,
  activityMightHaveStreams,
  extractLaps,
  type RateLimitInfo,
} from "./strava-api.js";

// Recent-history window (in days) that the backfill job enriches eagerly.
// Activities older than this are enriched on-demand from the MCP server.
export const ENRICH_WINDOW_DAYS = Number(process.env.ENRICH_WINDOW_DAYS) || 365;

// ISO date (YYYY-MM-DD) marking the start of the eager-enrichment window.
export function enrichWindowAfter(): string {
  return new Date(Date.now() - ENRICH_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export interface EnrichResult {
  ok: boolean;
  detail: boolean;
  laps: number;
  streamTypes: string[];
  zones: boolean;
  // The freshest rate-limit snapshot seen across the calls (for pacing batches).
  rateLimit: RateLimitInfo | null;
}

// Fully enrich a single activity. On an update event, pass `isUpdate: true` so
// stale laps/streams are cleared before re-storing. Returns a summary of what
// was stored; `ok: false` means the detailed activity could not be fetched.
export async function enrichActivity(
  activityId: number,
  athleteId: number,
  accessToken: string,
  options: { isUpdate?: boolean } = {},
): Promise<EnrichResult> {
  let rateLimit: RateLimitInfo | null = null;

  // 1. Detailed activity (description, splits, segment efforts, best efforts,
  //    gear, etc.) - stored as the full activity JSON.
  const activityResult = await fetchActivity(activityId, accessToken);
  if (!activityResult) {
    return {
      ok: false,
      detail: false,
      laps: 0,
      streamTypes: [],
      zones: false,
      rateLimit,
    };
  }
  const { data: activity } = activityResult;
  rateLimit = activityResult.rateLimit;
  await upsertActivity(
    activityId,
    athleteId,
    activity,
    activity.start_date as string,
  );

  // 2. Laps.
  const laps = extractLaps(activity, athleteId);
  let lapCount = 0;
  if (options.isUpdate) {
    await deleteActivityLaps(activityId);
  }
  if (laps && laps.length > 0) {
    lapCount = await upsertActivityLapsBatch(laps);
  }
  await markActivityLapsSynced(activityId);

  // 3. Streams (all configured types). Store an empty record when the activity
  //    can't have streams, so we don't repeatedly re-check it.
  let streamTypes: string[] = [];
  if (activityMightHaveStreams(activity)) {
    if (options.isUpdate) {
      await deleteActivityStreams(activityId);
    }
    const streamsResult = await fetchActivityStreams(activityId, accessToken);
    if (streamsResult) {
      await upsertActivityStreams(
        activityId,
        athleteId,
        streamsResult.streams,
        streamsResult.streamTypes,
      );
      streamTypes = streamsResult.streamTypes;
      rateLimit = streamsResult.rateLimit;
    }
  } else {
    await upsertActivityStreams(activityId, athleteId, {}, []);
  }

  // 4. Strava's per-activity time-in-zone distribution.
  let zonesStored = false;
  const zonesResult = await fetchActivityZones(activityId, accessToken);
  if (zonesResult) {
    await upsertActivityZones(activityId, athleteId, zonesResult.zones);
    zonesStored = true;
    rateLimit = zonesResult.rateLimit;
  }

  // 5. Mark fully enriched.
  await markActivityDetailSynced(activityId);

  return {
    ok: true,
    detail: true,
    laps: lapCount,
    streamTypes,
    zones: zonesStored,
    rateLimit,
  };
}
