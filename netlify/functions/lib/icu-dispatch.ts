// Fire-and-forget dispatch to the intervals.icu background function.
//
// Netlify freezes a function once it returns its response, so a write request
// can't reliably do the slow intervals.icu work inline. Instead the write path
// kicks off the `icu-sync-background` function (which returns 202 immediately
// and keeps running up to 15 min) and returns right away. The request only
// waits for the fast dispatch, never for intervals.icu.
import { createHash } from "node:crypto";
import { getSiteUrl } from "./strava.js";

// The dispatch itself is awaited (so the instance isn't frozen before the
// request is sent), but bounded so it can never hang the write.
const DISPATCH_TIMEOUT_MS = 4000;

// Shared secret protecting the public background endpoint. Prefer an explicit
// ICU_SYNC_SECRET; otherwise derive a stable, unguessable token from the DB URL
// (always present in prod) so this works with zero extra configuration.
export function getSyncSecret(): string {
  if (process.env.ICU_SYNC_SECRET) return process.env.ICU_SYNC_SECRET;
  return createHash("sha256")
    .update(process.env.NETLIFY_DATABASE_URL ?? "icu-sync-dev")
    .digest("hex");
}

export type IcuSyncJob =
  | { action: "syncWeek"; athleteId: number; weekStart: string }
  | { action: "deleteEvents"; athleteId: number; eventIds: number[] };

// ISO-week Monday (YYYY-MM-DD) for a given YYYY-MM-DD date string.
export function isoWeekMonday(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = (dt.getUTCDay() + 6) % 7; // 0 = Monday
  dt.setUTCDate(dt.getUTCDate() - day);
  return dt.toISOString().slice(0, 10);
}

// Extract intervals.icu event ids from workout rows (skips unsynced rows).
export function eventIdsOf(
  workouts: Array<{ icu_event_id: number | null }>,
): number[] {
  return workouts
    .map((w) => (w.icu_event_id == null ? null : Number(w.icu_event_id)))
    .filter((n): n is number => n != null && Number.isFinite(n));
}

async function dispatch(job: IcuSyncJob): Promise<void> {
  const url = `${getSiteUrl()}/.netlify/functions/icu-sync-background`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-icu-sync-secret": getSyncSecret(),
      },
      body: JSON.stringify(job),
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
    console.log(`[icu-dispatch] ${job.action} -> ${res.status}`);
  } catch (err) {
    // Never let a dispatch failure break the originating write.
    console.error(
      `[icu-dispatch] ${job.action} dispatch failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export function dispatchSyncWeek(
  athleteId: number,
  weekStart: string,
): Promise<void> {
  return dispatch({ action: "syncWeek", athleteId, weekStart });
}

export function dispatchSyncWeekForDate(
  athleteId: number,
  dateYmd: string,
): Promise<void> {
  return dispatchSyncWeek(athleteId, isoWeekMonday(dateYmd));
}

export function dispatchDeleteEvents(
  athleteId: number,
  eventIds: number[],
): Promise<void> {
  if (eventIds.length === 0) return Promise.resolve();
  return dispatch({ action: "deleteEvents", athleteId, eventIds });
}
