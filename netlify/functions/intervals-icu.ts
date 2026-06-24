// Self-serve management of the athlete's intervals.icu credentials, used to
// push planned workouts to Garmin via intervals.icu.
// GET    -> connection status (masked, never returns the raw key)
// PUT    -> save/replace the athlete id + API key (optionally test first)
// DELETE -> disconnect (remove stored credentials)
import type { Context } from "@netlify/functions";
import {
  withAuth,
  jsonResponse,
  jsonResponseWithCookies,
  parseTokensFromCookies,
  handleCorsPreFlight,
} from "./lib/strava.js";
import {
  getIcuCredentials,
  upsertIcuCredentials,
  deleteIcuCredentials,
} from "./lib/db.js";
import { testConnection } from "./lib/intervals-icu.js";

export default async function handler(request: Request, _context: Context) {
  if (request.method === "OPTIONS") {
    return handleCorsPreFlight();
  }

  return withAuth(request, async (req, _accessToken, newCookies) => {
    const cookieHeader = request.headers.get("cookie");
    const { athleteId } = parseTokensFromCookies(cookieHeader);

    if (!athleteId) {
      return jsonResponse({ error: "No athlete ID" }, 400);
    }

    try {
      if (request.method === "GET") {
        const creds = await getIcuCredentials(athleteId);
        return jsonResponseWithCookies(
          {
            connected: !!creds,
            icuAthleteId: creds?.icu_athlete_id ?? null,
            updatedAt: creds?.updated_at ?? null,
          },
          newCookies,
        );
      }

      if (request.method === "PUT") {
        const body = await req.json();
        const icuAthleteId =
          typeof body.icuAthleteId === "string" ? body.icuAthleteId.trim() : "";
        const apiKey =
          typeof body.apiKey === "string" ? body.apiKey.trim() : "";

        if (!icuAthleteId || !apiKey) {
          return jsonResponse(
            { error: "icuAthleteId and apiKey are required" },
            400,
          );
        }

        // Validate the credentials against intervals.icu before saving.
        const test = await testConnection({ icuAthleteId, apiKey });
        if (!test.ok) {
          return jsonResponse(
            { error: test.error || "Could not connect to intervals.icu" },
            400,
          );
        }

        const saved = await upsertIcuCredentials(athleteId, icuAthleteId, apiKey);
        return jsonResponseWithCookies(
          {
            connected: true,
            icuAthleteId: saved.icu_athlete_id,
            updatedAt: saved.updated_at,
            athleteName: test.name ?? null,
          },
          newCookies,
        );
      }

      if (request.method === "DELETE") {
        const deleted = await deleteIcuCredentials(athleteId);
        return jsonResponseWithCookies({ success: deleted }, newCookies);
      }

      return jsonResponse({ error: "Method not allowed" }, 405);
    } catch (error) {
      console.error("intervals.icu credentials error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "UNAUTHORIZED") {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      return jsonResponse({ error: "Failed to manage intervals.icu credentials" }, 500);
    }
  });
}
