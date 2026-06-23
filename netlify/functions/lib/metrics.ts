// Cycling/power-aware training metrics, ported from the frontend chart-utils.
// All functions are pure and operate on the raw Strava activity JSON stored in
// activities.data (Record<string, unknown>).

type Json = Record<string, unknown>;

function num(v: unknown): number | undefined {
  return typeof v === "number" && !Number.isNaN(v) ? v : undefined;
}

// Detect an indoor ride (trainer / no GPS), mirroring src/lib/chart-utils.ts.
export function isIndoorRide(activity: Json): boolean {
  const type = String(activity.type ?? "");
  if (type === "VirtualRide") return false;
  if (type !== "Ride" && type !== "EBikeRide") return false;

  const hasTrainerFlag = activity.trainer === true;
  const noGps =
    activity.start_latlng === null || activity.start_latlng === undefined;
  const map = activity.map as Json | undefined;
  const noPolyline = !map?.summary_polyline;

  return hasTrainerFlag || (noGps && noPolyline);
}

// Effective sport type for grouping (distinguishes indoor rides).
export function effectiveSportType(activity: Json): string {
  if (isIndoorRide(activity)) return "IndoorRide";
  return String(activity.sport_type ?? activity.type ?? "Unknown");
}

// Whether an activity has true power-meter data (not estimated).
export function hasPowerMeter(activity: Json): boolean {
  return activity.device_watts === true && num(activity.weighted_average_watts) !== undefined;
}

// Intensity Factor = NP / FTP.
export function intensityFactor(np: number, ftp: number): number {
  return np / ftp;
}

// Training Stress Score from Normalized Power (weighted_average_watts), FTP and duration.
export function computeTss(
  np: number,
  ftp: number,
  movingTimeSeconds: number,
): number {
  if (ftp <= 0 || movingTimeSeconds <= 0) return 0;
  const ifactor = np / ftp;
  return ((movingTimeSeconds * np * ifactor) / (ftp * 3600)) * 100;
}

// Estimate FTP from Strava power-zone boundaries when the athlete's FTP is
// unknown. Strava's default zones are fractions of FTP:
//   Z2 <=75%, Z3 <=90%, Z4 <=105%, Z5 <=120%  (Z4 upper ~= 1.05 * FTP)
// We average whatever boundary-derived estimates are available.
export function estimateFtpFromPowerZones(
  zones: Array<{ min: number; max: number }> | null | undefined,
): number | null {
  if (!zones || zones.length < 4) return null;
  const estimates: number[] = [];
  const z2 = zones[1]?.max;
  const z3 = zones[2]?.max;
  const z4 = zones[3]?.max;
  if (typeof z4 === "number" && z4 > 0) estimates.push(z4 / 1.05);
  else {
    if (typeof z3 === "number" && z3 > 0) estimates.push(z3 / 0.9);
    if (typeof z2 === "number" && z2 > 0) estimates.push(z2 / 0.75);
  }
  if (estimates.length === 0) return null;
  const avg = estimates.reduce((a, b) => a + b, 0) / estimates.length;
  return Math.round(avg);
}

// Day of week (Mon..Sun) from an ISO-ish date string.
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function dayOfWeek(dateStr: string): string {
  const d = new Date(dateStr);
  return DOW[d.getUTCDay()] ?? "";
}

// HH:MM local start time from start_date_local (kept as-is, no tz math).
export function localStartTime(startDateLocal: string | undefined): string | null {
  if (!startDateLocal || startDateLocal.length < 16) return null;
  return startDateLocal.slice(11, 16);
}

export interface AcuteChronic {
  acute_load_7d: number;
  chronic_load_28d: number;
  ramp_ratio: number;
}

// Compute acute (7-day) vs chronic (28-day, normalized to 7-day equivalent)
// load and the ramp ratio, evaluated at `asOf`. `daily` maps YYYY-MM-DD -> load.
export function acuteChronic(
  daily: Map<string, number>,
  asOf: Date = new Date(),
): AcuteChronic {
  const dayMs = 24 * 60 * 60 * 1000;
  let acute = 0;
  let chronic = 0;
  for (let i = 0; i < 28; i++) {
    const d = new Date(asOf.getTime() - i * dayMs);
    const key = d.toISOString().slice(0, 10);
    const load = daily.get(key) ?? 0;
    chronic += load;
    if (i < 7) acute += load;
  }
  const chronicNormalized = (chronic / 28) * 7;
  return {
    acute_load_7d: Math.round(acute),
    chronic_load_28d: Math.round(chronicNormalized),
    ramp_ratio:
      chronicNormalized > 0
        ? Math.round((acute / chronicNormalized) * 100) / 100
        : 0,
  };
}
