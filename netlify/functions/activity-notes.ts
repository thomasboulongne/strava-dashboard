import type { Context } from "@netlify/functions";
import {
  withAuth,
  jsonResponse,
  jsonResponseWithCookies,
  parseTokensFromCookies,
  handleCorsPreFlight,
} from "./lib/strava.js";
import {
  getActivityById,
  getActivityNote,
  upsertActivityNote,
} from "./lib/db.js";

// App-only note for an activity.
//   GET  /api/activity-notes?activityId=123  -> { note }
//   PUT  /api/activity-notes  { activityId, note } -> { note }
//
// This is intentionally separate from Strava's `private_note`: Strava exposes
// that field on reads (it rides along in the DetailedActivity JSON we cache),
// but its API offers no supported way to write it. So the editable note lives
// only in our DB and is never pushed back to Strava.
export default async function handler(request: Request, _context: Context) {
  if (request.method === "OPTIONS") {
    return handleCorsPreFlight();
  }

  return withAuth(request, async (req, _accessToken, newCookies) => {
    try {
      const cookieHeader = req.headers.get("cookie");
      const { athleteId } = parseTokensFromCookies(cookieHeader);

      if (!athleteId) {
        return jsonResponse({ error: "No athlete ID" }, 400);
      }

      const url = new URL(req.url);

      if (req.method === "GET") {
        const activityId = parseInt(
          url.searchParams.get("activityId") || "",
          10,
        );
        if (isNaN(activityId)) {
          return jsonResponse({ error: "Invalid activity ID" }, 400);
        }

        // Authorize: the activity must belong to the authenticated athlete.
        const activity = await getActivityById(activityId);
        if (!activity || Number(activity.athlete_id) !== Number(athleteId)) {
          return jsonResponse({ error: "Activity not found" }, 404);
        }

        const row = await getActivityNote(activityId);
        return jsonResponseWithCookies({ note: row?.note ?? "" }, newCookies);
      }

      if (req.method === "PUT" || req.method === "POST") {
        const body = await req.json();
        const activityId = Number(body?.activityId);
        const note = body?.note;

        if (!Number.isFinite(activityId)) {
          return jsonResponse({ error: "Invalid activity ID" }, 400);
        }
        if (typeof note !== "string") {
          return jsonResponse({ error: "Note must be a string" }, 400);
        }

        // Authorize: the activity must belong to the authenticated athlete.
        const activity = await getActivityById(activityId);
        if (!activity || Number(activity.athlete_id) !== Number(athleteId)) {
          return jsonResponse({ error: "Activity not found" }, 404);
        }

        const saved = await upsertActivityNote(activityId, athleteId, note);
        return jsonResponseWithCookies({ note: saved.note }, newCookies);
      }

      return jsonResponse({ error: "Method not allowed" }, 405);
    } catch (error) {
      console.error("Activity notes error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "UNAUTHORIZED") {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      return jsonResponse({ error: "Failed to handle activity note" }, 500);
    }
  });
}
