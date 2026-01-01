// Activity streams batch API endpoint
// Returns HR and power time-series data for multiple activities
import type { Context } from "@netlify/functions";
import {
  withAuth,
  jsonResponseWithCookies,
  jsonResponse,
  parseTokensFromCookies,
  handleCorsPreFlight,
} from "./lib/strava.js";
import {
  getActivityStreamsBatch,
  getAllActivityStreamsForAthlete,
} from "./lib/db.js";

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
      const activityIdsParam = url.searchParams.get("activityIds");
      const limitParam = url.searchParams.get("limit");

      // If specific activity IDs provided, fetch those
      if (activityIdsParam) {
        const activityIds = activityIdsParam
          .split(",")
          .map((id) => parseInt(id.trim(), 10))
          .filter((id) => !isNaN(id));

        if (activityIds.length === 0) {
          return jsonResponse({ error: "Invalid activity IDs" }, 400);
        }

        // Limit to 100 activities per request
        if (activityIds.length > 100) {
          return jsonResponse(
            { error: "Too many activity IDs (max 100)" },
            400
          );
        }

        const streams = await getActivityStreamsBatch(athleteId, activityIds);

        // Transform to a map keyed by activity ID for easy lookup
        const streamsMap: Record<number, {
          heartrate?: { data: number[] };
          watts?: { data: number[] };
          time?: { data: number[] };
        }> = {};

        streams.forEach((s) => {
          streamsMap[s.activity_id] = s.streams as typeof streamsMap[number];
        });

        return jsonResponseWithCookies(
          {
            streams: streamsMap,
            count: streams.length,
          },
          newCookies
        );
      }

      // Otherwise fetch all streams for athlete (with optional limit)
      const limit = limitParam ? parseInt(limitParam, 10) : undefined;
      const streams = await getAllActivityStreamsForAthlete(
        athleteId,
        limit && !isNaN(limit) ? Math.min(limit, 1000) : undefined
      );

      // Transform to a map keyed by activity ID
      const streamsMap: Record<number, {
        heartrate?: { data: number[] };
        watts?: { data: number[] };
        time?: { data: number[] };
      }> = {};

      streams.forEach((s) => {
        streamsMap[s.activity_id] = s.streams as typeof streamsMap[number];
      });

      return jsonResponseWithCookies(
        {
          streams: streamsMap,
          count: streams.length,
        },
        newCookies
      );
    } catch (error) {
      console.error("Activity streams fetch error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";

      if (message === "UNAUTHORIZED") {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      return jsonResponse({ error: "Failed to fetch activity streams" }, 500);
    }
  });
}

