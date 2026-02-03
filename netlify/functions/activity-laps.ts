// Endpoint for fetching activity laps from the database
import type { Context } from "@netlify/functions";
import { withAuth, jsonResponse } from "./lib/strava.js";
import { getLapsForActivity, getLapsForActivities } from "./lib/db.js";

// GET /api/activity-laps?activityId=123 - Get laps for a single activity
// GET /api/activity-laps?activityIds=123,456,789 - Get laps for multiple activities
export default async function handler(request: Request, _context: Context) {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  return withAuth(request, async (req) => {
    const url = new URL(req.url);
    const activityIdParam = url.searchParams.get("activityId");
    const activityIdsParam = url.searchParams.get("activityIds");

    // Single activity
    if (activityIdParam) {
      const activityId = parseInt(activityIdParam, 10);
      if (isNaN(activityId)) {
        return jsonResponse({ error: "Invalid activity ID" }, 400);
      }

      const laps = await getLapsForActivity(activityId);
      return jsonResponse({ laps, activityId });
    }

    // Multiple activities
    if (activityIdsParam) {
      const activityIds = activityIdsParam
        .split(",")
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id));

      if (activityIds.length === 0) {
        return jsonResponse({ error: "No valid activity IDs provided" }, 400);
      }

      const laps = await getLapsForActivities(activityIds);

      // Group laps by activity ID for easier client-side consumption
      const lapsByActivity: Record<number, typeof laps> = {};
      for (const lap of laps) {
        if (!lapsByActivity[lap.activity_id]) {
          lapsByActivity[lap.activity_id] = [];
        }
        lapsByActivity[lap.activity_id].push(lap);
      }

      return jsonResponse({ laps: lapsByActivity, count: activityIds.length });
    }

    return jsonResponse({ error: "Missing activityId or activityIds parameter" }, 400);
  });
}
