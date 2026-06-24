// Background function that performs the actual intervals.icu sync, decoupled
// from the request that triggered it. Netlify runs functions whose name ends in
// "-background" asynchronously (returns 202 immediately, up to 15 min runtime),
// so a slow intervals.icu API can never block the MCP/REST write that kicked it
// off. Invoked only by our own functions via lib/icu-dispatch.ts (secret-gated).
import type { Context } from "@netlify/functions";
import { getSyncSecret, type IcuSyncJob } from "./lib/icu-dispatch.js";
import { syncWeekToIcu, deleteWorkoutsFromIcu } from "./lib/icu-sync.js";

export default async function handler(request: Request, _context: Context) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secret = request.headers.get("x-icu-sync-secret");
  if (!secret || secret !== getSyncSecret()) {
    console.warn("[icu-sync-background] unauthorized request");
    return new Response("Unauthorized", { status: 401 });
  }

  let job: IcuSyncJob;
  try {
    job = (await request.json()) as IcuSyncJob;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const start = Date.now();
  console.log(
    `[icu-sync-background] start action=${job.action} athlete=${job.athleteId}`,
  );

  try {
    if (job.action === "syncWeek") {
      await syncWeekToIcu(Number(job.athleteId), String(job.weekStart));
    } else if (job.action === "deleteEvents") {
      const ids = (job.eventIds ?? []).map(Number);
      await deleteWorkoutsFromIcu(
        Number(job.athleteId),
        ids.map((id) => ({ icu_event_id: id })),
      );
    } else {
      return new Response("Unknown action", { status: 400 });
    }
  } catch (err) {
    console.error("[icu-sync-background] error:", err);
    return new Response("Sync error", { status: 500 });
  }

  console.log(
    `[icu-sync-background] done action=${job.action} (${Date.now() - start}ms)`,
  );
  return new Response("ok");
}
