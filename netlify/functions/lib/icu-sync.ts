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
import { hasIntervalStructure } from "./workout-structure.js";

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
  const start = Date.now();
  const credsRow = await getIcuCredentials(athleteId);
  if (!credsRow) {
    console.log(`[icu-sync] athlete ${athleteId} not connected — skipping sync`);
    return null;
  }

  const [zones, user] = await Promise.all([
    getAthleteZones(athleteId).catch(() => null),
    getUserById(athleteId).catch(() => null),
  ]);
  console.log(
    `[icu-sync] loaded context for athlete ${athleteId} (icuId=${credsRow.icu_athlete_id}, ${Date.now() - start}ms)`,
  );

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
    // Only push workouts that have interval structure. A plain steady/endurance
    // ride needs no Garmin workout file; if it previously had one (e.g. it was
    // edited from intervals to steady), remove that stale event.
    if (!hasIntervalStructure(workout)) {
      if (workout.icu_event_id != null) {
        console.log(
          `[icu-sync] workout ${workout.id} has no intervals — removing stale event`,
        );
        await deleteWorkoutEvent(creds, Number(workout.icu_event_id));
        await updateWorkoutIcuState(workout.id, {
          icu_event_id: null,
          icu_sync_error: null,
        });
      }
      return;
    }

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

// Push every workout in a week, one at a time. Single upserts reliably return
// each event id (so it's stored for later deletion), and structure-less rides
// are skipped. Runs in the background function, so sequential is fine.
export async function syncWeekToIcu(
  athleteId: number,
  weekStart: string,
): Promise<void> {
  const ctx = await loadContext(athleteId);
  if (!ctx) return;
  const workouts = await getTrainingWorkoutsForWeek(athleteId, weekStart);
  if (workouts.length === 0) {
    console.log(`[icu-sync] week ${weekStart}: no workouts to sync`);
    return;
  }

  console.log(
    `[icu-sync] week ${weekStart}: syncing ${workouts.length} workout(s)`,
  );
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
  console.log(`[icu-sync] deleting ${eventIds.length} event(s) from intervals.icu`);
  const creds: IcuCredentials = {
    icuAthleteId: credsRow.icu_athlete_id,
    apiKey: credsRow.api_key,
  };

  await Promise.all(
    eventIds.map((eventId) =>
      deleteWorkoutEvent(creds, eventId).catch((err) => {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[icu-sync] delete event ${eventId} failed:`, message);
      }),
    ),
  );
}
