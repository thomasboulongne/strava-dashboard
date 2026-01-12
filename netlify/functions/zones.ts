// Zones API endpoint - fetches and caches athlete HR/power zones from Strava
import type { Context } from "@netlify/functions";
import {
  withAuth,
  jsonResponseWithCookies,
  jsonResponse,
  parseTokensFromCookies,
  fetchFromStrava,
  handleCorsPreFlight,
} from "./lib/strava.js";
import {
  getAthleteZones,
  upsertAthleteZones,
  zonesNeedRefresh,
  type StravaZonesResponse,
} from "./lib/db.js";
import { getValidAccessToken } from "./lib/strava-api.js";

export default async function handler(request: Request, _context: Context) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return handleCorsPreFlight();
  }

  return withAuth(request, async (_req, _accessToken, newCookies) => {
    try {
      const cookieHeader = request.headers.get("cookie");
      const { athleteId } = parseTokensFromCookies(cookieHeader);

      if (!athleteId) {
        return jsonResponse({ error: "No athlete ID" }, 400);
      }

      // Check if we have cached zones that are fresh enough
      const needsRefresh = await zonesNeedRefresh(athleteId);
      const cachedZones = await getAthleteZones(athleteId);

      // If we have fresh zones, return them
      if (cachedZones && !needsRefresh) {
        return jsonResponseWithCookies(
          {
            zones: {
              heart_rate: cachedZones.heart_rate_zones
                ? {
                    custom_zones: cachedZones.heart_rate_custom,
                    zones: cachedZones.heart_rate_zones,
                  }
                : null,
              power: cachedZones.power_zones
                ? { zones: cachedZones.power_zones }
                : null,
            },
            cached: true,
            updated_at: cachedZones.updated_at,
          },
          newCookies
        );
      }

      // Fetch fresh zones from Strava
      const validToken = await getValidAccessToken(athleteId);
      if (!validToken) {
        // Return cached zones if available, even if stale
        if (cachedZones) {
          return jsonResponseWithCookies(
            {
              zones: {
                heart_rate: cachedZones.heart_rate_zones
                  ? {
                      custom_zones: cachedZones.heart_rate_custom,
                      zones: cachedZones.heart_rate_zones,
                    }
                  : null,
                power: cachedZones.power_zones
                  ? { zones: cachedZones.power_zones }
                  : null,
              },
              cached: true,
              stale: true,
              updated_at: cachedZones.updated_at,
            },
            newCookies
          );
        }
        return jsonResponse({ error: "Could not get valid access token" }, 401);
      }

      // Fetch zones from Strava API
      const stravaZones: StravaZonesResponse = await fetchFromStrava(
        "/athlete/zones",
        validToken
      );

      // Store in database
      const updatedZones = await upsertAthleteZones(athleteId, stravaZones);

      return jsonResponseWithCookies(
        {
          zones: {
            heart_rate: stravaZones.heart_rate ?? null,
            power: stravaZones.power ?? null,
          },
          cached: false,
          updated_at: updatedZones.updated_at,
        },
        newCookies
      );
    } catch (error) {
      console.error("Zones fetch error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";

      if (message === "UNAUTHORIZED") {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      return jsonResponse({ error: "Failed to fetch zones" }, 500);
    }
  });
}



