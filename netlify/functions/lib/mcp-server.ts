// Read-only MCP server exposing the athlete's stored Strava data.
// Tools reuse the existing Neon helpers in db.ts and return compact JSON so
// a ChatGPT agent can fetch activities/laps/streams/zones to build a plan.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getActivitiesForAthlete,
  getActivityById,
  getActivityStreams,
  getLapsForActivity,
  getAthleteZones,
  getUserById,
  getWeeklyReportsForAthlete,
  getTrainingWorkoutsForWeek,
  getTrainingWorkoutById,
  insertTrainingWorkoutsBatch,
  deleteTrainingWorkoutsForDays,
  updateTrainingWorkout,
  deleteTrainingWorkoutsForWeek,
  linkActivityToWorkout,
  unlinkActivityFromWorkout,
  upsertWeeklyReport,
  type DbActivity,
  type DbAthleteZones,
  type DbTrainingWorkout,
} from "./db.js";
import {
  isIndoorRide,
  effectiveSportType,
  hasPowerMeter,
  computeTss,
  estimateFtpFromPowerZones,
  acuteChronic,
  dayOfWeek,
  localStartTime,
} from "./metrics.js";
import {
  dispatchSyncWeek,
  dispatchSyncWeekForDate,
  dispatchDeleteEvents,
  eventIdsOf,
  isoWeekMonday,
} from "./icu-dispatch.js";
import {
  parseTrainingPlanTable,
  convertToDbWorkouts,
} from "./training-plan-parser.js";

const STRAVA_ACTIVITY_URL = "https://www.strava.com/activities/";

// Resolve the athlete's FTP: cached value from the users table (refreshed
// whenever the dashboard fetches /api/athlete), else estimated from their
// Strava power-zone boundaries. Avoids a live Strava call per request.
async function resolveFtp(
  athleteId: number,
  zones: DbAthleteZones | null,
): Promise<{ ftp: number | null; source: "cached" | "estimated_from_zones" | null }> {
  const user = await getUserById(athleteId);
  if (user?.ftp && user.ftp > 0) return { ftp: user.ftp, source: "cached" };
  const estimated = estimateFtpFromPowerZones(zones?.power_zones);
  if (estimated) return { ftp: estimated, source: "estimated_from_zones" };
  return { ftp: null, source: null };
}

// --- Projections / summaries -------------------------------------------------

// Pull a compact, plan-relevant subset out of the full Strava activity JSON.
function summarizeActivity(activity: Record<string, unknown>) {
  const pick = <T>(key: string): T | undefined => activity[key] as T | undefined;
  return {
    id: pick<number>("id"),
    name: pick<string>("name"),
    type: pick<string>("type"),
    sport_type: pick<string>("sport_type"),
    start_date_local: pick<string>("start_date_local"),
    distance_m: pick<number>("distance"),
    moving_time_s: pick<number>("moving_time"),
    elapsed_time_s: pick<number>("elapsed_time"),
    total_elevation_gain_m: pick<number>("total_elevation_gain"),
    average_speed_mps: pick<number>("average_speed"),
    max_speed_mps: pick<number>("max_speed"),
    average_heartrate: pick<number>("average_heartrate"),
    max_heartrate: pick<number>("max_heartrate"),
    average_watts: pick<number>("average_watts"),
    weighted_average_watts: pick<number>("weighted_average_watts"),
    average_cadence: pick<number>("average_cadence"),
    kilojoules: pick<number>("kilojoules"),
    calories: pick<number>("calories"),
    suffer_score: pick<number>("suffer_score"),
    perceived_exertion: pick<number>("perceived_exertion"),
    has_heartrate: pick<boolean>("has_heartrate"),
    trainer: pick<boolean>("trainer"),
    commute: pick<boolean>("commute"),
  };
}

function summarizeLap(lap: Record<string, unknown>) {
  const pick = <T>(key: string): T | undefined => lap[key] as T | undefined;
  return {
    lap_index: pick<number>("lap_index"),
    name: pick<string>("name"),
    distance_m: pick<number>("distance"),
    moving_time_s: pick<number>("moving_time"),
    elapsed_time_s: pick<number>("elapsed_time"),
    average_speed_mps: pick<number>("average_speed"),
    max_speed_mps: pick<number>("max_speed"),
    average_heartrate: pick<number>("average_heartrate"),
    max_heartrate: pick<number>("max_heartrate"),
    average_watts: pick<number>("average_watts"),
    average_cadence: pick<number>("average_cadence"),
    total_elevation_gain_m: pick<number>("total_elevation_gain"),
  };
}

interface StoredStream {
  data?: number[];
}

function streamStats(values: number[] | undefined) {
  if (!values || values.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of values) {
    if (typeof v !== "number" || Number.isNaN(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  if (!Number.isFinite(min)) return null;
  return {
    avg: Math.round((sum / values.length) * 10) / 10,
    min,
    max,
    samples: values.length,
  };
}

// Compute seconds spent in each zone given a value stream (HR or power),
// an optional time stream (for non-uniform sampling) and zone ranges.
function timeInZones(
  values: number[] | undefined,
  time: number[] | undefined,
  zones: Array<{ min: number; max: number }> | null | undefined
) {
  if (!values || values.length === 0 || !zones || zones.length === 0) {
    return null;
  }

  const seconds = new Array(zones.length).fill(0);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v !== "number" || Number.isNaN(v)) continue;

    // Duration this sample represents (delta to next time sample, default 1s).
    let dt = 1;
    if (time && time.length === values.length) {
      if (i < values.length - 1) {
        dt = Math.max(0, time[i + 1] - time[i]);
      }
    }

    for (let z = 0; z < zones.length; z++) {
      const zone = zones[z];
      const upper = zone.max <= 0 ? Infinity : zone.max; // Strava uses -1 for "no upper bound"
      if (v >= zone.min && v < upper) {
        seconds[z] += dt;
        break;
      }
    }
  }

  const total = seconds.reduce((a, b) => a + b, 0);
  return zones.map((zone, z) => ({
    zone: z + 1,
    min: zone.min,
    max: zone.max,
    seconds: Math.round(seconds[z]),
    percentage: total > 0 ? Math.round((seconds[z] / total) * 1000) / 10 : 0,
  }));
}

async function buildStreamSummary(activityId: number, zones: DbAthleteZones | null) {
  const row = await getActivityStreams(activityId);
  if (!row || !row.streams) return null;

  const streams = row.streams as Record<string, StoredStream>;
  const hr = streams.heartrate?.data;
  const watts = streams.watts?.data;
  const time = streams.time?.data;

  if (!hr && !watts) return null;

  return {
    available_types: row.stream_types,
    heartrate: streamStats(hr),
    watts: streamStats(watts),
    hr_time_in_zones: timeInZones(hr, time, zones?.heart_rate_zones),
    power_time_in_zones: timeInZones(watts, time, zones?.power_zones),
  };
}

// --- Aggregation -------------------------------------------------------------

// ISO week start (Monday) for grouping, returned as YYYY-MM-DD.
function isoWeekStart(dateStr: string): string {
  const d = new Date(dateStr);
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

// Internal accumulator (carries running sums for averaging).
interface TotalsAcc {
  count: number;
  distance_m: number;
  moving_time_s: number;
  elevation_gain_m: number;
  relative_effort: number; // sum of suffer_score
  kilojoules: number;
  tss: number; // power-based, rides with NP + FTP
  ride_count: number;
  power_ride_count: number;
  indoor_ride_count: number;
  // running sums for weighted averages
  hr_sum: number; // avg_hr weighted by moving_time
  hr_time: number;
  np_sum: number; // weighted_average_watts weighted by moving_time (power rides)
  np_time: number;
  if_sum: number; // intensity factor sum (power rides)
  if_count: number;
}

function emptyTotals(): TotalsAcc {
  return {
    count: 0,
    distance_m: 0,
    moving_time_s: 0,
    elevation_gain_m: 0,
    relative_effort: 0,
    kilojoules: 0,
    tss: 0,
    ride_count: 0,
    power_ride_count: 0,
    indoor_ride_count: 0,
    hr_sum: 0,
    hr_time: 0,
    np_sum: 0,
    np_time: 0,
    if_sum: 0,
    if_count: 0,
  };
}

const RIDE_TYPES = new Set(["Ride", "VirtualRide", "EBikeRide"]);

function addToTotals(
  t: TotalsAcc,
  a: Record<string, unknown>,
  ftp: number | null,
) {
  const n = (v: unknown) =>
    typeof v === "number" && !Number.isNaN(v) ? v : 0;
  const movingTime = n(a.moving_time);

  t.count += 1;
  t.distance_m += n(a.distance);
  t.moving_time_s += movingTime;
  t.elevation_gain_m += n(a.total_elevation_gain);
  t.relative_effort += n(a.suffer_score);
  t.kilojoules += n(a.kilojoules);

  const hr = n(a.average_heartrate);
  if (hr > 0 && movingTime > 0) {
    t.hr_sum += hr * movingTime;
    t.hr_time += movingTime;
  }

  const type = String(a.type ?? "");
  if (RIDE_TYPES.has(type)) {
    t.ride_count += 1;
    if (isIndoorRide(a)) t.indoor_ride_count += 1;

    if (hasPowerMeter(a)) {
      t.power_ride_count += 1;
      const np = n(a.weighted_average_watts);
      if (np > 0 && movingTime > 0) {
        t.np_sum += np * movingTime;
        t.np_time += movingTime;
        if (ftp && ftp > 0) {
          t.tss += computeTss(np, ftp, movingTime);
          t.if_sum += np / ftp;
          t.if_count += 1;
        }
      }
    }
  }
}

// Project the accumulator into a rounded, readable output record.
function finalizeTotals(t: TotalsAcc) {
  return {
    count: t.count,
    distance_km: Math.round((t.distance_m / 1000) * 10) / 10,
    moving_time_h: Math.round((t.moving_time_s / 3600) * 10) / 10,
    elevation_gain_m: Math.round(t.elevation_gain_m),
    relative_effort: Math.round(t.relative_effort),
    kilojoules: Math.round(t.kilojoules),
    tss: Math.round(t.tss),
    ride_count: t.ride_count,
    power_ride_count: t.power_ride_count,
    indoor_ride_count: t.indoor_ride_count,
    avg_heartrate:
      t.hr_time > 0 ? Math.round(t.hr_sum / t.hr_time) : null,
    avg_weighted_watts:
      t.np_time > 0 ? Math.round(t.np_sum / t.np_time) : null,
    avg_intensity_factor:
      t.if_count > 0 ? Math.round((t.if_sum / t.if_count) * 100) / 100 : null,
  };
}

// --- Tool result helper ------------------------------------------------------

function textResult(payload: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    // Also return structured output so tools with an outputSchema validate and
    // ChatGPT can consume the result as structured data, not just text.
    structuredContent: payload,
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
  };
}

// --- Training plan helpers ---------------------------------------------------

// Normalize a training workout row for tool output (formats workout_date).
function serializeWorkout(w: DbTrainingWorkout) {
  const date =
    w.workout_date instanceof Date
      ? w.workout_date.toISOString().slice(0, 10)
      : String(w.workout_date).slice(0, 10);
  return {
    id: w.id,
    workout_date: date,
    day_order: w.day_order,
    time_of_day: w.time_of_day,
    session_name: w.session_name,
    duration_target_minutes: w.duration_target_minutes,
    intensity_target: w.intensity_target,
    notes: w.notes,
    workout_text: w.workout_text,
    matched_activity_id: w.matched_activity_id,
    is_manually_linked: w.is_manually_linked,
    icu_sync_error: w.icu_sync_error,
  };
}

// Add `days` days to a YYYY-MM-DD string, returning YYYY-MM-DD (UTC math).
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// --- Server ------------------------------------------------------------------

// Build a server scoped to a single athlete. The caller (mcp.ts) resolves the
// athlete from the request's per-user API key before constructing the server.
export function buildServer(athleteId: number): McpServer {
  const server = new McpServer({
    name: "strava-dashboard",
    version: "1.0.0",
  });

  server.registerTool(
    "list_activities",
    {
      title: "List activities",
      outputSchema: {
        count: z.number(),
        activities: z.array(z.unknown()),
      },
      description:
        "List the athlete's recent Strava activities (most recent first) as compact summaries. Supports date and sport-type filtering. Use this to understand recent training load before building a plan.",
      inputSchema: {
        after: z
          .string()
          .optional()
          .describe("Only activities on/after this ISO date (e.g. 2026-05-01)"),
        before: z
          .string()
          .optional()
          .describe("Only activities before this ISO date (e.g. 2026-06-01)"),
        type: z
          .string()
          .optional()
          .describe("Filter by Strava activity type, e.g. Run, Ride, Swim"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Max activities to return (default 30, max 50)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ after, before, type, limit }) => {
      try {
        const cap = limit ?? 30;
        // Over-fetch a little so type filtering can still fill the page.
        const dbActivities = await getActivitiesForAthlete(athleteId, {
          limit: type ? Math.min(cap * 4, 200) : cap,
          before,
          after,
        });

        let activities = dbActivities.map((a: DbActivity) => a.data);
        if (type) {
          const t = type.toLowerCase();
          activities = activities.filter(
            (a) => String(a.type ?? "").toLowerCase() === t
          );
        }
        activities = activities.slice(0, cap);

        return textResult({
          count: activities.length,
          activities: activities.map(summarizeActivity),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Unknown error");
      }
    }
  );

  server.registerTool(
    "get_activity",
    {
      title: "Get activity detail",
      outputSchema: {
        activity: z.unknown(),
        laps: z.array(z.unknown()).optional(),
        streams_summary: z.unknown().optional(),
      },
      description:
        "Get the full detail for a single activity by its Strava ID, optionally including lap splits and a heart-rate/power stream summary (averages, max, and time-in-zone). Use this to analyze a specific session.",
      inputSchema: {
        id: z.number().int().describe("Strava activity ID"),
        include_laps: z
          .boolean()
          .optional()
          .describe("Include lap-by-lap splits (default true)"),
        include_streams_summary: z
          .boolean()
          .optional()
          .describe("Include HR/power stream summary and time-in-zone (default true)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id, include_laps, include_streams_summary }) => {
      try {
        const activity = await getActivityById(id);
        // Neon returns BIGINT columns as strings, so coerce before comparing.
        if (!activity || Number(activity.athlete_id) !== athleteId) {
          return errorResult(`Activity ${id} not found`);
        }

        const payload: Record<string, unknown> = {
          activity: activity.data,
        };

        if (include_laps !== false) {
          const laps = await getLapsForActivity(id);
          payload.laps = laps.map((l) => summarizeLap(l.data));
        }

        if (include_streams_summary !== false) {
          const zones = await getAthleteZones(athleteId);
          payload.streams_summary = await buildStreamSummary(id, zones);
        }

        return textResult(payload);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Unknown error");
      }
    }
  );

  server.registerTool(
    "get_activity_summary",
    {
      title: "Summarize training load",
      outputSchema: {
        range: z.unknown(),
        ftp: z.number().nullable(),
        ftp_source: z.string().nullable(),
        load: z.unknown(),
        overall: z.unknown(),
        by_week: z.array(z.unknown()),
        by_sport: z.array(z.unknown()),
      },
      description:
        "Aggregate cycling-aware training load over a date range, grouped by ISO week and by sport. Each bucket includes volume (distance, time, elevation), relative effort (Strava suffer score), power metrics (TSS, kilojoules, weighted-average watts, intensity factor), HR, and ride/power-ride/indoor counts. Also returns an overall acute (7-day) vs chronic (28-day) load with ramp ratio to flag overtraining, plus which weeks have a saved weekly report. Default range is the last 8 weeks; pass `after` for longer windows (e.g. 6 months).",
      inputSchema: {
        after: z
          .string()
          .optional()
          .describe("Start of range, ISO date (default: 8 weeks ago)"),
        before: z.string().optional().describe("End of range, ISO date (default: now)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ after, before }) => {
      try {
        const defaultAfter = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        const rangeAfter = after ?? defaultAfter;
        const dbActivities = await getActivitiesForAthlete(athleteId, {
          limit: 1000,
          after: rangeAfter,
          before,
        });

        const zones = await getAthleteZones(athleteId);
        const { ftp, source: ftpSource } = await resolveFtp(athleteId, zones);

        const byWeek: Record<string, TotalsAcc> = {};
        const bySport: Record<string, TotalsAcc> = {};
        const overall = emptyTotals();
        // Daily load maps for acute/chronic computation.
        const dailyEffort = new Map<string, number>();
        const dailyTss = new Map<string, number>();

        for (const row of dbActivities) {
          const a = row.data;
          const dateStr =
            (a.start_date_local as string) || row.start_date.toISOString();
          const week = isoWeekStart(dateStr);
          const sport = effectiveSportType(a);
          const dayKey = dateStr.slice(0, 10);

          byWeek[week] = byWeek[week] || emptyTotals();
          bySport[sport] = bySport[sport] || emptyTotals();
          addToTotals(byWeek[week], a, ftp);
          addToTotals(bySport[sport], a, ftp);
          addToTotals(overall, a, ftp);

          const effort =
            typeof a.suffer_score === "number" ? a.suffer_score : 0;
          dailyEffort.set(dayKey, (dailyEffort.get(dayKey) ?? 0) + effort);
          if (ftp && hasPowerMeter(a)) {
            const np = a.weighted_average_watts as number;
            const tss = computeTss(np, ftp, (a.moving_time as number) || 0);
            dailyTss.set(dayKey, (dailyTss.get(dayKey) ?? 0) + tss);
          }
        }

        // Which weeks have a saved report (so the agent knows to read them).
        const reports = await getWeeklyReportsForAthlete(athleteId, {
          after: rangeAfter,
          before,
        });
        const reportWeeks = new Map(
          reports.map((r) => [
            (r.week_start instanceof Date
              ? r.week_start.toISOString()
              : String(r.week_start)
            ).slice(0, 10),
            r.title,
          ]),
        );

        return textResult({
          range: { after: rangeAfter, before: before ?? null },
          ftp: ftp ?? null,
          ftp_source: ftpSource,
          load: {
            relative_effort_based: acuteChronic(dailyEffort),
            tss_based: ftp ? acuteChronic(dailyTss) : null,
            note: "acute = last 7 days, chronic = last 28 days normalized to a 7-day equivalent; ramp_ratio > ~1.3 suggests rapid load increase.",
          },
          overall: finalizeTotals(overall),
          by_week: Object.entries(byWeek)
            .sort(([a], [b]) => (a < b ? 1 : -1))
            .map(([week_start, totals]) => ({
              week_start,
              ...finalizeTotals(totals),
              report_title: reportWeeks.get(week_start) ?? null,
            })),
          by_sport: Object.entries(bySport).map(([sport, totals]) => ({
            sport,
            ...finalizeTotals(totals),
          })),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Unknown error");
      }
    }
  );

  server.registerTool(
    "get_athlete_zones",
    {
      title: "Get heart-rate and power zones",
      outputSchema: {
        heart_rate_zones: z.array(z.unknown()).nullable(),
        heart_rate_custom: z.boolean().optional(),
        power_zones: z.array(z.unknown()).nullable(),
        updated_at: z.unknown().optional(),
      },
      description:
        "Get the athlete's configured heart-rate and power zone ranges. Use these to interpret time-in-zone data and to prescribe intensity targets.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const zones = await getAthleteZones(athleteId);
        if (!zones) {
          return textResult({ heart_rate_zones: null, power_zones: null });
        }
        return textResult({
          heart_rate_zones: zones.heart_rate_zones,
          heart_rate_custom: zones.heart_rate_custom,
          power_zones: zones.power_zones,
          updated_at: zones.updated_at,
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Unknown error");
      }
    }
  );

  server.registerTool(
    "get_athlete_profile",
    {
      title: "Get athlete profile",
      outputSchema: {
        id: z.number(),
        username: z.string().nullable(),
        firstname: z.string(),
        lastname: z.string(),
      },
      description:
        "Get the athlete's basic profile (name and Strava ID). Contains no credentials.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const user = await getUserById(athleteId);
        if (!user) return errorResult("Athlete not found");
        return textResult({
          id: user.id,
          username: user.username,
          firstname: user.firstname,
          lastname: user.lastname,
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Unknown error");
      }
    }
  );

  // search/fetch: thin wrappers for broad ChatGPT (incl. deep-research) compatibility.
  server.registerTool(
    "search",
    {
      title: "Search activities",
      outputSchema: {
        results: z.array(z.unknown()),
      },
      description:
        "Search the athlete's activities by keyword (matches activity name or type). Returns a list of {id, title, url} results that can be passed to `fetch`.",
      inputSchema: {
        query: z.string().describe("Keyword to match against activity name or type"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      try {
        const dbActivities = await getActivitiesForAthlete(athleteId, { limit: 300 });
        const q = query.trim().toLowerCase();
        const results = dbActivities
          .filter((row) => {
            const a = row.data;
            return (
              String(a.name ?? "").toLowerCase().includes(q) ||
              String(a.type ?? "").toLowerCase().includes(q)
            );
          })
          .slice(0, 25)
          .map((row) => {
            const a = row.data;
            return {
              id: String(a.id),
              title: `${a.name ?? "Activity"} (${a.type ?? "?"}, ${
                (a.start_date_local as string)?.slice(0, 10) ?? ""
              })`,
              url: `${STRAVA_ACTIVITY_URL}${a.id}`,
            };
          });
        return textResult({ results });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Unknown error");
      }
    }
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch activity document",
      outputSchema: {
        id: z.string(),
        title: z.string(),
        url: z.string(),
        text: z.string(),
        metadata: z.unknown(),
      },
      description:
        "Fetch the full detail document for a single activity by ID (as returned by `search`). Includes the activity summary, laps, and stream summary.",
      inputSchema: {
        id: z.string().describe("Activity ID (string) as returned by search"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      try {
        const numericId = parseInt(id, 10);
        if (Number.isNaN(numericId)) return errorResult(`Invalid id: ${id}`);

        const activity = await getActivityById(numericId);
        if (!activity || Number(activity.athlete_id) !== athleteId) {
          return errorResult(`Activity ${id} not found`);
        }

        const zones = await getAthleteZones(athleteId);
        const laps = await getLapsForActivity(numericId);
        const streamsSummary = await buildStreamSummary(numericId, zones);
        const a = activity.data;

        const document = {
          id: String(a.id),
          title: `${a.name ?? "Activity"} (${a.type ?? "?"})`,
          url: `${STRAVA_ACTIVITY_URL}${a.id}`,
          text: JSON.stringify({
            activity: summarizeActivity(a),
            laps: laps.map((l) => summarizeLap(l.data)),
            streams_summary: streamsSummary,
          }),
          metadata: {
            type: String(a.type ?? ""),
            start_date_local: String(a.start_date_local ?? ""),
          },
        };
        return textResult(document);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Unknown error");
      }
    }
  );

  server.registerTool(
    "export_activities",
    {
      title: "Export activities (bulk)",
      outputSchema: {
        range: z.unknown(),
        count: z.number(),
        activities: z.array(z.unknown()),
      },
      description:
        "Export many activities over a date range as compact, cycling-focused rows (up to 1000, no 50-item cap). Each row includes date, local start time, day of week, sport, indoor flag, duration, distance, elevation, HR, power (avg/weighted/max watts, kilojoules, cadence, power-meter flag), relative effort, and commute/trainer flags. Use this for habit analysis (training days, time of day, frequency, rest days, streaks) and per-ride power/effort review across long windows like 6 months.",
      inputSchema: {
        after: z
          .string()
          .optional()
          .describe("Start of range, ISO date (default: 6 months ago)"),
        before: z.string().optional().describe("End of range, ISO date (default: now)"),
        type: z
          .string()
          .optional()
          .describe("Filter by Strava activity type, e.g. Run, Ride, Swim"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe("Max rows to return (default 1000, max 1000)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ after, before, type, limit }) => {
      try {
        const defaultAfter = new Date(Date.now() - 182 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        const cap = limit ?? 1000;
        const dbActivities = await getActivitiesForAthlete(athleteId, {
          limit: cap,
          after: after ?? defaultAfter,
          before,
        });

        const n = (v: unknown) =>
          typeof v === "number" && !Number.isNaN(v) ? v : null;

        let rows = dbActivities.map((row) => {
          const a = row.data;
          const startLocal = a.start_date_local as string | undefined;
          return {
            id: a.id,
            date: startLocal?.slice(0, 10) ?? null,
            start_time_local: localStartTime(startLocal),
            day_of_week: startLocal ? dayOfWeek(startLocal) : null,
            type: a.type ?? null,
            sport_type: a.sport_type ?? null,
            is_indoor: isIndoorRide(a),
            moving_time_s: n(a.moving_time),
            distance_m: n(a.distance),
            elevation_gain_m: n(a.total_elevation_gain),
            average_heartrate: n(a.average_heartrate),
            max_heartrate: n(a.max_heartrate),
            average_watts: n(a.average_watts),
            weighted_average_watts: n(a.weighted_average_watts),
            max_watts: n(a.max_watts),
            kilojoules: n(a.kilojoules),
            average_cadence: n(a.average_cadence),
            has_power_meter: hasPowerMeter(a),
            relative_effort: n(a.suffer_score),
            calories: n(a.calories),
            trainer: a.trainer === true,
            commute: a.commute === true,
            private_note:
              typeof a.private_note === "string" && a.private_note
                ? a.private_note
                : null,
          };
        });

        if (type) {
          const t = type.toLowerCase();
          rows = rows.filter(
            (r) => String(r.type ?? "").toLowerCase() === t,
          );
        }

        return textResult({
          range: { after: after ?? defaultAfter, before: before ?? null },
          count: rows.length,
          activities: rows,
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Unknown error");
      }
    }
  );

  server.registerTool(
    "get_weekly_reports",
    {
      title: "Get weekly reports",
      outputSchema: {
        count: z.number(),
        reports: z.array(z.unknown()),
      },
      description:
        "Get the athlete's saved weekly reports (markdown notes / coach feedback) over a date range, newest first. These provide qualitative context — how training felt, intent, and plans — to complement the quantitative data when building a training plan.",
      inputSchema: {
        after: z
          .string()
          .optional()
          .describe("Earliest week_start, ISO date (e.g. 2026-01-01)"),
        before: z
          .string()
          .optional()
          .describe("Latest week_start, ISO date"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ after, before }) => {
      try {
        const reports = await getWeeklyReportsForAthlete(athleteId, {
          after,
          before,
        });
        return textResult({
          count: reports.length,
          reports: reports.map((r) => ({
            week_start:
              r.week_start instanceof Date
                ? r.week_start.toISOString().slice(0, 10)
                : String(r.week_start).slice(0, 10),
            title: r.title,
            markdown: r.markdown,
          })),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Unknown error");
      }
    }
  );

  // --- Training plan: read --------------------------------------------------

  server.registerTool(
    "get_training_plan",
    {
      title: "Get training plan for a week",
      outputSchema: {
        week_start: z.string(),
        count: z.number(),
        workouts: z.array(z.unknown()),
      },
      description:
        "Get the planned workouts for the ISO week starting on `week_start` (a Monday, YYYY-MM-DD), including each workout's id (needed to edit it), target duration/intensity, notes, and any matched activity.",
      inputSchema: {
        week_start: z
          .string()
          .describe("Monday of the week, ISO date (YYYY-MM-DD)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ week_start }) => {
      try {
        if (!DATE_RE.test(week_start)) {
          return errorResult("week_start must be YYYY-MM-DD");
        }
        const workouts = await getTrainingWorkoutsForWeek(athleteId, week_start);
        return textResult({
          week_start,
          count: workouts.length,
          workouts: workouts.map(serializeWorkout),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Unknown error");
      }
    }
  );

  // --- Training plan: write -------------------------------------------------

  server.registerTool(
    "upsert_training_plan",
    {
      title: "Upsert weekly training plan",
      outputSchema: {
        week_start: z.string(),
        mode: z.string(),
        imported: z.number(),
        workouts: z.array(z.unknown()),
      },
      description:
        "Save a whole week's training plan in ONE call. After drafting a plan, call this to persist it (it is also auto-synced to intervals.icu/Garmin). Create or replace the plan for the ISO week starting on `week_start` (Monday); provide structured `workouts` whose dates fall within that week. mode='replace' (default) clears the week first then inserts; mode='merge' overwrites only the given days and keeps the rest. If you have the plan as a markdown table instead, use import_training_plan_markdown.",
      inputSchema: {
        week_start: z
          .string()
          .describe("Monday of the week, ISO date (YYYY-MM-DD)"),
        workouts: z
          .array(
            z.object({
              date: z.string().describe("Workout date, YYYY-MM-DD"),
              session_name: z.string().describe("Session name/title"),
              duration_target_minutes: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Target duration in minutes"),
              intensity_target: z
                .string()
                .optional()
                .describe("Intensity target, e.g. 'Z2', '3x10min @ threshold', '200-220W'"),
              notes: z.string().optional(),
              time_of_day: z
                .string()
                .optional()
                .describe(
                  "Optional label for ordering/distinguishing multiple workouts on the same day, e.g. 'AM' or 'PM'.",
                ),
              workout_text: z
                .string()
                .optional()
                .describe(
                  "intervals.icu workout in its text format (pushed verbatim to Garmin). Each step is a line starting with '- '. For repeats, put a standalone 'Nx' line (e.g. '3x') before the work+recovery steps with a blank line before and after the block (do NOT inline as '- 3x10m ...'). End warm-up, recovery and cool-down steps with 'Press lap' (lap-button) and leave work intervals timed. Example: '- 15m 55-75% Press lap\\n\\n3x\\n- 10m 88-93%\\n- 5m 55% Press lap\\n\\n- 10m 55% Press lap'. If omitted, a best-effort structure is derived from session_name/intensity_target.",
                ),
            }),
          )
          .min(1)
          .describe("Structured workouts for the week"),
        mode: z
          .enum(["replace", "merge"])
          .optional()
          .describe(
            "replace (default) clears the whole week first; merge replaces only the days you provide (all workouts on those days) and keeps other days. Multiple workouts per day are allowed.",
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ week_start, workouts, mode }) => {
      try {
        console.log(
          `[tool upsert_training_plan] athlete=${athleteId} week=${week_start} mode=${mode ?? "replace"} count=${workouts.length}`,
        );
        if (!DATE_RE.test(week_start)) {
          return errorResult("week_start must be YYYY-MM-DD");
        }
        const weekEnd = addDays(week_start, 7);
        for (const w of workouts) {
          if (!DATE_RE.test(w.date)) {
            return errorResult(`Invalid workout date: ${w.date}`);
          }
          if (w.date < week_start || w.date >= weekEnd) {
            return errorResult(
              `Workout date ${w.date} is outside the week ${week_start}..${addDays(week_start, 6)}`,
            );
          }
        }

        // Clear the workouts being replaced (whole week, or just the provided
        // days for merge), capturing their rows so we can delete the matching
        // intervals.icu events.
        const effectiveMode = mode ?? "replace";
        let removed: DbTrainingWorkout[] = [];
        if (effectiveMode === "replace") {
          removed = await getTrainingWorkoutsForWeek(athleteId, week_start);
          await deleteTrainingWorkoutsForWeek(athleteId, week_start);
        } else {
          const days = [...new Set(workouts.map((w) => w.date))];
          removed = await deleteTrainingWorkoutsForDays(athleteId, days);
        }
        await dispatchDeleteEvents(athleteId, eventIdsOf(removed));

        // Insert the new workouts (duplicate dates allowed; day_order is set
        // from each workout's position within its date).
        const inserted = await insertTrainingWorkoutsBatch(
          workouts.map((w) => ({
            athlete_id: athleteId,
            workout_date: w.date,
            session_name: w.session_name,
            duration_target_minutes: w.duration_target_minutes ?? null,
            intensity_target: w.intensity_target ?? null,
            notes: w.notes ?? null,
            time_of_day: w.time_of_day ?? null,
            workout_text: w.workout_text ?? null,
          })),
        );

        console.log(
          `[tool upsert_training_plan] inserted ${inserted.length} row(s); dispatching intervals.icu sync`,
        );
        // Hand the intervals.icu sync to the background function so this tool
        // returns immediately (never blocked by intervals.icu).
        await dispatchSyncWeek(athleteId, week_start);
        console.log(`[tool upsert_training_plan] done`);

        const saved = await getTrainingWorkoutsForWeek(athleteId, week_start);
        return textResult({
          week_start,
          mode: effectiveMode,
          imported: inserted.length,
          workouts: saved.map(serializeWorkout),
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Unknown error");
      }
    }
  );

  server.registerTool(
    "import_training_plan_markdown",
    {
      title: "Import training plan (markdown)",
      description:
        "Create/replace a week's training plan from a markdown table with columns: Day | Session | Duration | Intensity target | Notes. A simpler, flat-input alternative to upsert_training_plan when you already have the plan as a table. Saved workouts are auto-synced to intervals.icu/Garmin (intensity is auto-converted). For precise multi-set workouts on Garmin, prefer upsert_training_plan with workout_text.",
      inputSchema: {
        reference_date: z
          .string()
          .describe(
            "Any date within the target week, YYYY-MM-DD (used to resolve the weekday rows to calendar dates)",
          ),
        markdown: z.string().describe("Markdown table of the week's workouts"),
      },
      outputSchema: {
        imported: z.number(),
        weeks: z.array(z.string()),
        parse_errors: z.array(z.string()),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ reference_date, markdown }) => {
      try {
        if (!DATE_RE.test(reference_date)) {
          return errorResult("reference_date must be YYYY-MM-DD");
        }
        const parsed = parseTrainingPlanTable(markdown);
        if (parsed.workouts.length === 0) {
          return errorResult(
            `No workouts found in the table. ${parsed.errors.join("; ")}`,
          );
        }
        const [y, m, d] = reference_date.split("-").map(Number);
        const refDate = new Date(Date.UTC(y, m - 1, d));
        const dbWorkouts = convertToDbWorkouts(parsed, athleteId, refDate);

        // Replace any existing workouts on the imported days, then insert.
        const days = [...new Set(dbWorkouts.map((w) => w.workout_date))];
        const removed = await deleteTrainingWorkoutsForDays(athleteId, days);
        await dispatchDeleteEvents(athleteId, eventIdsOf(removed));
        const inserted = await insertTrainingWorkoutsBatch(dbWorkouts);

        const weeks = [
          ...new Set(dbWorkouts.map((w) => isoWeekMonday(w.workout_date))),
        ];
        await Promise.all(weeks.map((wk) => dispatchSyncWeek(athleteId, wk)));

        return textResult({
          imported: inserted.length,
          weeks,
          parse_errors: parsed.errors,
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Unknown error");
      }
    },
  );

  server.registerTool(
    "update_workout",
    {
      title: "Update a workout",
      outputSchema: {
        workout: z.unknown(),
      },
      description:
        "Update a single planned workout by its id (from get_training_plan). Only the fields you provide are changed. Use this to tweak a session's name, target duration, intensity, or notes.",
      inputSchema: {
        workout_id: z.number().int().describe("Workout id from get_training_plan"),
        session_name: z.string().optional(),
        duration_target_minutes: z.number().int().positive().optional(),
        intensity_target: z.string().optional(),
        notes: z.string().optional(),
        time_of_day: z
          .string()
          .optional()
          .describe("Optional label, e.g. 'AM' or 'PM', for same-day ordering."),
        workout_text: z
          .string()
          .optional()
          .describe(
            "intervals.icu workout in its text format (pushed verbatim to Garmin). Repeats use a standalone 'Nx' line before the work+recovery steps (blank line around the block), not inline. End warm-up/recovery/cool-down steps with 'Press lap'; leave work intervals timed.",
          ),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ workout_id, session_name, duration_target_minutes, intensity_target, notes, time_of_day, workout_text }) => {
      try {
        console.log(`[tool update_workout] athlete=${athleteId} workout=${workout_id}`);
        const existing = await getTrainingWorkoutById(workout_id);
        if (!existing || Number(existing.athlete_id) !== athleteId) {
          return errorResult(`Workout ${workout_id} not found`);
        }
        const updated = await updateTrainingWorkout(workout_id, {
          session_name: session_name ?? existing.session_name,
          duration_target_minutes:
            duration_target_minutes !== undefined
              ? duration_target_minutes
              : existing.duration_target_minutes,
          intensity_target:
            intensity_target !== undefined
              ? intensity_target
              : existing.intensity_target,
          notes: notes !== undefined ? notes : existing.notes,
          time_of_day:
            time_of_day !== undefined ? time_of_day : existing.time_of_day,
          workout_text:
            workout_text !== undefined ? workout_text : existing.workout_text,
        });

        // Decouple the intervals.icu sync (runs in the background function).
        await dispatchSyncWeekForDate(
          athleteId,
          serializeWorkout(updated).workout_date,
        );

        return textResult({ workout: serializeWorkout(updated) });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Unknown error");
      }
    }
  );

  server.registerTool(
    "delete_training_plan",
    {
      title: "Delete a week's training plan",
      outputSchema: {
        week_start: z.string(),
        deleted: z.number(),
      },
      description:
        "Delete all planned workouts for the ISO week starting on `week_start` (Monday). Destructive; use with care.",
      inputSchema: {
        week_start: z
          .string()
          .describe("Monday of the week, ISO date (YYYY-MM-DD)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ week_start }) => {
      try {
        console.log(`[tool delete_training_plan] athlete=${athleteId} week=${week_start}`);
        if (!DATE_RE.test(week_start)) {
          return errorResult("week_start must be YYYY-MM-DD");
        }
        // Capture intervals.icu event ids before removing the rows.
        const toDelete = await getTrainingWorkoutsForWeek(athleteId, week_start);
        const deleted = await deleteTrainingWorkoutsForWeek(athleteId, week_start);
        await dispatchDeleteEvents(athleteId, eventIdsOf(toDelete));
        return textResult({ week_start, deleted });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Unknown error");
      }
    }
  );

  server.registerTool(
    "link_activity_to_workout",
    {
      title: "Link an activity to a workout",
      outputSchema: {
        workout: z.unknown(),
      },
      description:
        "Manually link a completed activity to a planned workout (both must belong to you). Use after confirming which session an activity corresponds to.",
      inputSchema: {
        workout_id: z.number().int().describe("Workout id from get_training_plan"),
        activity_id: z.number().int().describe("Strava activity id"),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ workout_id, activity_id }) => {
      try {
        const workout = await getTrainingWorkoutById(workout_id);
        if (!workout || Number(workout.athlete_id) !== athleteId) {
          return errorResult(`Workout ${workout_id} not found`);
        }
        const activity = await getActivityById(activity_id);
        if (!activity || Number(activity.athlete_id) !== athleteId) {
          return errorResult(`Activity ${activity_id} not found`);
        }
        const updated = await linkActivityToWorkout(workout_id, activity_id, true);
        return textResult({ workout: updated ? serializeWorkout(updated) : null });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Unknown error");
      }
    }
  );

  server.registerTool(
    "unlink_activity_from_workout",
    {
      title: "Unlink an activity from a workout",
      outputSchema: {
        workout: z.unknown(),
      },
      description:
        "Remove the activity link from a planned workout (yours only).",
      inputSchema: {
        workout_id: z.number().int().describe("Workout id from get_training_plan"),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ workout_id }) => {
      try {
        const workout = await getTrainingWorkoutById(workout_id);
        if (!workout || Number(workout.athlete_id) !== athleteId) {
          return errorResult(`Workout ${workout_id} not found`);
        }
        const updated = await unlinkActivityFromWorkout(workout_id);
        return textResult({ workout: updated ? serializeWorkout(updated) : null });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Unknown error");
      }
    }
  );

  // --- Weekly report: write -------------------------------------------------

  server.registerTool(
    "upsert_weekly_report",
    {
      title: "Save weekly report",
      outputSchema: {
        week_start: z.string(),
        title: z.string(),
        saved: z.boolean(),
      },
      description:
        "Create or replace the saved weekly report for the week starting on `week_start` (Monday, YYYY-MM-DD). Provide a `title` and the full `markdown` body. Use this to upload a report you generated from the week's activities and private notes.",
      inputSchema: {
        week_start: z
          .string()
          .describe("Monday of the week, ISO date (YYYY-MM-DD)"),
        title: z.string().describe("Report title"),
        markdown: z.string().describe("Full report body in markdown"),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ week_start, title, markdown }) => {
      try {
        if (!DATE_RE.test(week_start)) {
          return errorResult("week_start must be YYYY-MM-DD");
        }
        const report = await upsertWeeklyReport(
          athleteId,
          week_start,
          title,
          markdown,
        );
        return textResult({
          week_start:
            report.week_start instanceof Date
              ? report.week_start.toISOString().slice(0, 10)
              : String(report.week_start).slice(0, 10),
          title: report.title,
          saved: true,
        });
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : "Unknown error");
      }
    }
  );

  return server;
}
