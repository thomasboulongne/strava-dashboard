import type { Context } from "@netlify/functions";
import {
  withAuth,
  jsonResponseWithCookies,
  jsonResponse,
  parseTokensFromCookies,
  handleCorsPreFlight,
} from "./lib/strava.js";
import { getActivitiesForAthlete, getActivityCount } from "./lib/db.js";

export default async function handler(request: Request, _context: Context) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return handleCorsPreFlight();
  }

  return withAuth(request, async (req, _accessToken, newCookies) => {
    try {
      const cookieHeader = request.headers.get("cookie");
      const { athleteId } = parseTokensFromCookies(cookieHeader);

      if (!athleteId) {
        return jsonResponse({ error: "No athlete ID" }, 400);
      }

      const url = new URL(req.url);
      const limit = parseInt(url.searchParams.get("limit") || "200", 10);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);
      const before = url.searchParams.get("before") || undefined;
      const after = url.searchParams.get("after") || undefined;

      // Fetch activities from database
      const dbActivities = await getActivitiesForAthlete(athleteId, {
        limit,
        offset,
        before,
        after,
      });

      // Get total count for pagination
      const totalCount = await getActivityCount(athleteId);

      // Transform DB activities to match the Strava API format
      const activities = dbActivities.map((dbActivity) => dbActivity.data);

      return jsonResponseWithCookies(
        {
          activities,
          total: totalCount,
          limit,
          offset,
          hasMore: offset + activities.length < totalCount,
        },
        newCookies
      );
    } catch (error) {
      console.error("Activities fetch error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "UNAUTHORIZED") {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      return jsonResponse({ error: "Failed to fetch activities" }, 500);
    }
  });
}
