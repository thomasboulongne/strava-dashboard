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
  upsertWorkoutEventsBulk,
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

// Overall budget for a sync triggered inline by a write request. Keeps the
// caller comfortably under the serverless function execution limit (~10s).
export const SYNC_BUDGET_MS = 9000;

/**
 * Run a best-effort sync with an overall time budget so a slow intervals.icu
 * can never make the caller (e.g. an MCP write tool) exceed the function's
 * execution limit. The sync records its own per-workout errors, so abandoning
 * it on timeout is safe — the next edit retries.
 */
export async function withTimeBudget(
  ms: number,
  task: Promise<void>,
): Promise<void> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = true;
  const budget = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  const wrapped = task
    .catch((err) => {
      console.error("[icu-sync] task error:", err);
    })
    .then(() => {
      timedOut = false;
    });
  try {
    await Promise.race([wrapped, budget]);
  } finally {
    if (timer) clearTimeout(timer);
    if (timedOut) {
      console.warn(
        `[icu-sync] sync exceeded ${ms}ms budget — returning; sync continues best-effort`,
      );
    } else {
      console.log(`[icu-sync] sync finished in ${Date.now() - start}ms`);
    }
  }
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
  athleteId: number,
  workout: DbTrainingWorkout,
): Promise<void> {
  try {
    const description = workoutToIcuDescription(workout, opts);
    const eventId = await upsertWorkoutEvent(creds, athleteId, {
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
  await pushOne(ctx.creds, ctx.opts, athleteId, workout);
}

// Push every workout in a week in ONE bulk request, then persist the resulting
// event ids / errors. Used after a markdown import or a bulk plan upsert.
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

  const inputs = workouts.map((w) => ({
    dateYmd: toYmd(w.workout_date),
    name: w.session_name,
    description: workoutToIcuDescription(w, ctx.opts),
  }));

  console.log(
    `[icu-sync] week ${weekStart}: bulk upserting ${inputs.length} workout(s)`,
  );
  try {
    const idByDate = await upsertWorkoutEventsBulk(ctx.creds, athleteId, inputs);
    console.log(
      `[icu-sync] week ${weekStart}: bulk upsert ok, ${idByDate.size} event id(s) returned`,
    );
    await Promise.all(
      workouts.map((w) =>
        updateWorkoutIcuState(w.id, {
          icu_event_id: idByDate.get(toYmd(w.workout_date)),
          icu_sync_error: null,
        }).catch(() => undefined),
      ),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown sync error";
    console.error(`[icu-sync] week ${weekStart} bulk sync failed:`, message);
    await Promise.all(
      workouts.map((w) =>
        updateWorkoutIcuState(w.id, { icu_sync_error: message }).catch(
          () => undefined,
        ),
      ),
    );
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
