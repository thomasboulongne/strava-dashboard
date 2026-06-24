// intervals.icu API client + workout serializer.
//
// intervals.icu ignores the structured `workout_doc` on writes, so a workout
// must be serialized into its text DSL (e.g. "- 10m 60%\n- 3x10m 90% 5m 55%")
// and sent in the `description` field. We push each planned workout as a Ride
// WORKOUT calendar event; intervals.icu then forwards it to Garmin Connect.
import type { DbTrainingWorkout } from "./db.js";
import { parseSetsFromText } from "./workout-structure.js";

const ICU_BASE_URL = "https://intervals.icu/api/v1";

export interface IcuCredentials {
  icuAthleteId: string;
  apiKey: string;
}

// How long any single intervals.icu request may take before it is aborted, so
// a slow or unreachable API can never hang the serverless function.
const ICU_TIMEOUT_MS = 8000;

// Stable per-day id (there is one workout per athlete per day). Keyed by
// athlete + date rather than the DB row id, so re-pushes upsert in place via
// ?upsertOnUid=true and survive plan "replace" (which reassigns row ids).
export function workoutUid(athleteId: number, dateYmd: string): string {
  return `strava-dashboard-a${athleteId}-${dateYmd}`;
}

function authHeader(apiKey: string): string {
  // intervals.icu uses HTTP Basic auth: username "API_KEY", password = key.
  const token = Buffer.from(`API_KEY:${apiKey}`).toString("base64");
  return `Basic ${token}`;
}

// fetch with an abort timeout (Node 18+ provides AbortSignal.timeout).
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const method = init.method ?? "GET";
  // Strip the host so logs show just the path (no secrets are in the URL).
  const path = url.replace(ICU_BASE_URL, "");
  const start = Date.now();
  console.log(`[icu-http] ${method} ${path} ...`);
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(ICU_TIMEOUT_MS),
    });
    console.log(
      `[icu-http] ${method} ${path} -> ${res.status} (${Date.now() - start}ms)`,
    );
    return res;
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "TimeoutError"
        ? `timeout after ${ICU_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : "unknown error";
    console.error(
      `[icu-http] ${method} ${path} -> FAILED ${reason} (${Date.now() - start}ms)`,
    );
    throw err;
  }
}

// --- Workout text (DSL) serialization ---------------------------------------

// Representative %FTP range per training zone (Coggan-style). Used when the
// athlete's own power zones can't be converted to percentages.
const DEFAULT_ZONE_PCT: Record<number, { lo: number; hi: number }> = {
  1: { lo: 50, hi: 60 },
  2: { lo: 60, hi: 75 },
  3: { lo: 76, hi: 90 },
  4: { lo: 91, hi: 105 },
  5: { lo: 106, hi: 120 },
};

export interface SerializeOptions {
  powerZones?: Array<{ min: number; max: number }> | null;
  ftp?: number | null;
}

function zoneToPct(
  zone: number,
  opts?: SerializeOptions,
): { lo: number; hi: number } {
  const z = Math.min(Math.max(Math.round(zone), 1), 5);
  // Prefer the athlete's actual power zones converted to %FTP when available.
  const zones = opts?.powerZones;
  const ftp = opts?.ftp;
  if (zones && ftp && ftp > 0 && zones[z - 1]) {
    const { min, max } = zones[z - 1];
    const lo = Math.round((min / ftp) * 100);
    // Strava uses -1 for "no upper bound" on the top zone.
    const hi = max > 0 ? Math.round((max / ftp) * 100) : lo + 15;
    if (lo > 0 && hi > lo) return { lo, hi };
  }
  return DEFAULT_ZONE_PCT[z];
}

const ZONE_KEYWORDS: Array<[RegExp, number]> = [
  [/recovery|rest day/i, 1],
  [/endurance|easy|aerobic|long|z2|zone\s*2/i, 2],
  [/tempo|z3|zone\s*3|sweet\s*spot|ss\b/i, 3],
  [/threshold|ftp|z4|zone\s*4/i, 4],
  [/vo2|anaerobic|sprint|hard|max|z5|zone\s*5/i, 5],
];

// Best-effort: text -> training zone (1-5).
function textToZone(text: string | null | undefined): number | null {
  if (!text) return null;
  const explicit = text.match(/z(?:one\s*)?\s*([1-5])/i);
  if (explicit) return parseInt(explicit[1], 10);
  for (const [re, zone] of ZONE_KEYWORDS) {
    if (re.test(text)) return zone;
  }
  return null;
}

// text -> %FTP range, honoring explicit "85%" / "90% FTP" mentions.
function textToPct(
  text: string | null | undefined,
  opts?: SerializeOptions,
): { lo: number; hi: number } | null {
  if (!text) return null;
  const rangeMatch = text.match(/(\d{2,3})\s*[-–]\s*(\d{2,3})\s*%/);
  if (rangeMatch) {
    return { lo: parseInt(rangeMatch[1], 10), hi: parseInt(rangeMatch[2], 10) };
  }
  const singleMatch = text.match(/(\d{2,3})\s*%/);
  if (singleMatch) {
    const v = parseInt(singleMatch[1], 10);
    return { lo: v, hi: v };
  }
  const zone = textToZone(text);
  if (zone) return zoneToPct(zone, opts);
  return null;
}

interface ParsedInterval {
  count: number;
  workSec: number;
  recoverySec: number | null;
}

// Detect "Nx<duration>" style interval structures in the session text.
function parseIntervalStructure(text: string): ParsedInterval | null {
  const patterns = [
    /(\d+)\s*[x×]\s*(\d+)\s*(min(?:ute)?s?|m)\b/i,
    /(\d+)\s*[x×]\s*(\d+)\s*['′]/,
    /(\d+)\s*[x×]\s*(\d+)\s*(sec(?:ond)?s?|s)\b/i,
    /(\d+)\s*[x×]\s*(\d+)\s*["″]/,
  ];
  for (let i = 0; i < patterns.length; i++) {
    const m = text.match(patterns[i]);
    if (!m) continue;
    const count = parseInt(m[1], 10);
    const value = parseInt(m[2], 10);
    const unit = (m[3] || "").toLowerCase();
    const isSeconds =
      i === 2 || i === 3 || unit.startsWith("sec") || unit === "s";
    const workSec = isSeconds ? value : value * 60;
    if (count < 1 || count > 30 || workSec < 5 || workSec > 7200) continue;

    // Recovery: "/ 3min", "with 2min recovery", "(90s recovery)".
    let recoverySec: number | null = null;
    const recMatch = text.match(
      /(?:\/|with|after|then|,)\s*(\d+)\s*(min(?:ute)?s?|m|sec(?:ond)?s?|s|['′"])\s*(?:recovery|rest|easy|spin)?/i,
    );
    if (recMatch) {
      const rv = parseInt(recMatch[1], 10);
      const ru = (recMatch[2] || "").toLowerCase();
      const recIsSeconds =
        ru.startsWith("sec") || ru === "s" || ru === '"' || ru === "″";
      const sec = recIsSeconds ? rv : rv * 60;
      if (sec >= 5 && sec <= 1800) recoverySec = sec;
    }
    return { count, workSec, recoverySec };
  }
  return null;
}

function fmtDuration(seconds: number): string {
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s}s`;
}

function fmtPct(p: { lo: number; hi: number }): string {
  return p.lo === p.hi ? `${p.lo}%` : `${p.lo}-${p.hi}%`;
}

/**
 * Build the intervals.icu workout description (DSL) for a workout.
 * Prefers the explicit `workout_text`; otherwise derives a best-effort
 * structure from the free-text session fields.
 */
export function workoutToIcuDescription(
  workout: Pick<
    DbTrainingWorkout,
    | "workout_text"
    | "session_name"
    | "intensity_target"
    | "duration_target_minutes"
    | "notes"
  >,
  opts?: SerializeOptions,
): string {
  if (workout.workout_text && workout.workout_text.trim()) {
    return workout.workout_text.trim();
  }

  const combined = [workout.session_name, workout.intensity_target]
    .filter(Boolean)
    .join(" ");

  const targetPct =
    textToPct(workout.intensity_target, opts) ??
    textToPct(workout.session_name, opts) ??
    zoneToPct(2, opts);

  // Multi-set workouts (e.g. "3x10min @ Z4 then 2x20min @ Z3"): emit one repeat
  // line per set, bracketed by a light warm-up / cool-down.
  const sets = parseSetsFromText(
    workout.session_name,
    workout.intensity_target ?? null,
  );
  if (sets.length > 1) {
    const lines = [`- 10m ${fmtPct(zoneToPct(2, opts))}`];
    for (const s of sets) {
      const workPct = fmtPct(zoneToPct(s.targetZone ?? 3, opts));
      const recoveryPct = fmtPct(zoneToPct(1, opts));
      const recoverySec = s.recoverySec ?? 180;
      lines.push(
        `- ${s.count}x${fmtDuration(s.workSec)} ${workPct} ${fmtDuration(
          recoverySec,
        )} ${recoveryPct}`,
      );
    }
    lines.push(`- 5m ${fmtPct(zoneToPct(1, opts))}`);
    return lines.join("\n");
  }

  const structure = parseIntervalStructure(combined);
  if (structure) {
    const recoveryPct = zoneToPct(1, opts);
    const recoverySec = structure.recoverySec ?? 180;
    const work = `${structure.count}x${fmtDuration(
      structure.workSec,
    )} ${fmtPct(targetPct)} ${fmtDuration(recoverySec)} ${fmtPct(recoveryPct)}`;
    // Add a light warm-up / cool-down to bracket the intervals.
    return [`- 10m ${fmtPct(zoneToPct(2, opts))}`, `- ${work}`, `- 5m ${fmtPct(zoneToPct(1, opts))}`].join("\n");
  }

  // Single steady step from the target duration (default 60 min).
  const minutes = workout.duration_target_minutes ?? 60;
  return `- ${minutes}m ${fmtPct(targetPct)}`;
}

// --- API calls --------------------------------------------------------------

export interface UpsertWorkoutInput {
  dateYmd: string; // YYYY-MM-DD
  name: string;
  description: string;
}

export class IcuApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "IcuApiError";
    this.status = status;
  }
}

// Build the intervals.icu calendar-event body for a single workout.
function eventBody(athleteId: number, input: UpsertWorkoutInput) {
  const uid = workoutUid(athleteId, input.dateYmd);
  return {
    uid,
    external_id: uid,
    category: "WORKOUT",
    type: "Ride",
    start_date_local: `${input.dateYmd}T00:00:00`,
    name: input.name,
    description: input.description,
  };
}

// Create or update a single workout calendar event. Returns the event id.
export async function upsertWorkoutEvent(
  creds: IcuCredentials,
  athleteId: number,
  input: UpsertWorkoutInput,
): Promise<number> {
  const url = `${ICU_BASE_URL}/athlete/${creds.icuAthleteId}/events?upsertOnUid=true`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(creds.apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(eventBody(athleteId, input)),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new IcuApiError(
      `intervals.icu upsert failed (${res.status}): ${text.slice(0, 300)}`,
      res.status,
    );
  }

  const data = (await res.json().catch(() => null)) as
    | { id?: number }
    | Array<{ id?: number }>
    | null;
  const event = Array.isArray(data) ? data[0] : data;
  const id = event?.id;
  if (typeof id !== "number") {
    throw new IcuApiError("intervals.icu upsert returned no event id", 502);
  }
  return id;
}

/**
 * Create or update many workout events in a SINGLE request. Returns a map of
 * date (YYYY-MM-DD) -> intervals.icu event id for events we can match back via
 * their deterministic uid.
 */
export async function upsertWorkoutEventsBulk(
  creds: IcuCredentials,
  athleteId: number,
  inputs: UpsertWorkoutInput[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (inputs.length === 0) return result;

  const url = `${ICU_BASE_URL}/athlete/${creds.icuAthleteId}/events/bulk?upsertOnUid=true`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(creds.apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(inputs.map((i) => eventBody(athleteId, i))),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new IcuApiError(
      `intervals.icu bulk upsert failed (${res.status}): ${text.slice(0, 300)}`,
      res.status,
    );
  }

  const data = (await res.json().catch(() => null)) as
    | Array<{ id?: number; uid?: string }>
    | null;
  if (!Array.isArray(data)) {
    throw new IcuApiError("intervals.icu bulk upsert returned no events", 502);
  }

  // Map returned event ids back to their date via the deterministic uid.
  const idByUid = new Map<string, number>();
  for (const ev of data) {
    if (ev && typeof ev.id === "number" && typeof ev.uid === "string") {
      idByUid.set(ev.uid, ev.id);
    }
  }
  for (const input of inputs) {
    const id = idByUid.get(workoutUid(athleteId, input.dateYmd));
    if (id !== undefined) result.set(input.dateYmd, id);
  }
  return result;
}

// Delete a workout calendar event. A 404 is treated as already-gone (success).
export async function deleteWorkoutEvent(
  creds: IcuCredentials,
  eventId: number,
): Promise<void> {
  const url = `${ICU_BASE_URL}/athlete/${creds.icuAthleteId}/events/${eventId}`;
  const res = await fetchWithTimeout(url, {
    method: "DELETE",
    headers: { Authorization: authHeader(creds.apiKey) },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new IcuApiError(
      `intervals.icu delete failed (${res.status}): ${text.slice(0, 300)}`,
      res.status,
    );
  }
}

// Verify credentials by fetching the athlete profile.
export async function testConnection(
  creds: IcuCredentials,
): Promise<{ ok: boolean; name?: string; error?: string }> {
  try {
    const url = `${ICU_BASE_URL}/athlete/${creds.icuAthleteId}/profile`;
    const res = await fetchWithTimeout(url, {
      headers: { Authorization: authHeader(creds.apiKey) },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `intervals.icu returned ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const data = (await res.json().catch(() => null)) as {
      athlete?: { name?: string };
    } | null;
    return { ok: true, name: data?.athlete?.name };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
