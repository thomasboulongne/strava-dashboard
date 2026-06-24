// Orchestrates pushing planned workouts to intervals.icu.
//
// All functions are best-effort: a missing-credentials case is a silent no-op,
// and any API failure is captured into the workout's `icu_sync_error` rather
// than propagated, so a sync problem never breaks a plan write.
import {
  getIcuCredentials,
  getAthleteZones,
  getUserById,
  updateWorkoutIcuState,
  getTrainingWorkoutsForWeek,
  type DbTrainingWorkout,
} from "./db.js";
import {
  upsertWorkoutEvent,
  deleteWorkoutEvent,
  workoutToIcuDescription,
  type IcuCredentials,
  type SerializeOptions,
} from "./intervals-icu.js";

function toYmd(workoutDate: Date | string): string {
  return workoutDate instanceof Date
    ? workoutDate.toISOString().slice(0, 10)
    : String(workoutDate).slice(0, 10);
}

// Resolve the per-athlete context (credentials + power zones/FTP) once so a
// batch sync doesn't refetch it per workout. Returns null when not connected.
async function loadContext(
  athleteId: number,
): Promise<{ creds: IcuCredentials; opts: SerializeOptions } | null> {
  const credsRow = await getIcuCredentials(athleteId);
  if (!credsRow) return null;

  const [zones, user] = await Promise.all([
    getAthleteZones(athleteId).catch(() => null),
    getUserById(athleteId).catch(() => null),
  ]);

  return {
    creds: { icuAthleteId: credsRow.icu_athlete_id, apiKey: credsRow.api_key },
    opts: { powerZones: zones?.power_zones ?? null, ftp: user?.ftp ?? null },
  };
}

async function pushOne(
  creds: IcuCredentials,
  opts: SerializeOptions,
  workout: DbTrainingWorkout,
): Promise<void> {
  try {
    const description = workoutToIcuDescription(workout, opts);
    const eventId = await upsertWorkoutEvent(creds, {
      workoutId: workout.id,
      dateYmd: toYmd(workout.workout_date),
      name: workout.session_name,
      description,
    });
    await updateWorkoutIcuState(workout.id, {
      icu_event_id: eventId,
      icu_sync_error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown sync error";
    console.error(`[icu-sync] workout ${workout.id} failed:`, message);
    await updateWorkoutIcuState(workout.id, { icu_sync_error: message }).catch(
      () => undefined,
    );
  }
}

// Push a single workout to intervals.icu. No-op if the athlete isn't connected.
export async function syncWorkoutToIcu(
  athleteId: number,
  workout: DbTrainingWorkout,
): Promise<void> {
  const ctx = await loadContext(athleteId);
  if (!ctx) return;
  await pushOne(ctx.creds, ctx.opts, workout);
}

// Push every workout in a week (used after a markdown import / bulk upsert).
export async function syncWeekToIcu(
  athleteId: number,
  weekStart: string,
): Promise<void> {
  const ctx = await loadContext(athleteId);
  if (!ctx) return;
  const workouts = await getTrainingWorkoutsForWeek(athleteId, weekStart);
  for (const workout of workouts) {
    await pushOne(ctx.creds, ctx.opts, workout);
  }
}

// Remove workouts from intervals.icu by their stored event ids. Capture the
// rows (with icu_event_id) BEFORE deleting them from the database.
export async function deleteWorkoutsFromIcu(
  athleteId: number,
  workouts: Array<Pick<DbTrainingWorkout, "icu_event_id">>,
): Promise<void> {
  const eventIds = workouts
    .map((w) => (w.icu_event_id == null ? null : Number(w.icu_event_id)))
    .filter((id): id is number => id != null && !Number.isNaN(id));
  if (eventIds.length === 0) return;

  const credsRow = await getIcuCredentials(athleteId);
  if (!credsRow) return;
  const creds: IcuCredentials = {
    icuAthleteId: credsRow.icu_athlete_id,
    apiKey: credsRow.api_key,
  };

  for (const eventId of eventIds) {
    try {
      await deleteWorkoutEvent(creds, eventId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[icu-sync] delete event ${eventId} failed:`, message);
    }
  }
}
