import type { Context } from "@netlify/functions";
import {
  fetchFromStrava,
  withAuth,
  jsonResponseWithCookies,
  jsonResponse,
} from "./lib/strava.js";
import { cacheAthleteDetails } from "./lib/db.js";

export default async function handler(request: Request, _context: Context) {
  return withAuth(request, async (_req, accessToken, newCookies) => {
    try {
      const athlete = await fetchFromStrava("/athlete", accessToken);

      // Cache FTP, body weight, and gear (bikes/shoes) for the MCP server
      // (best-effort, non-blocking on failure).
      const a = athlete as {
        id?: number;
        ftp?: number;
        weight?: number;
        bikes?: unknown[];
        shoes?: unknown[];
      };
      const athleteId = a.id;
      if (typeof athleteId === "number") {
        cacheAthleteDetails(athleteId, {
          ftp: typeof a.ftp === "number" && a.ftp > 0 ? a.ftp : undefined,
          weight: typeof a.weight === "number" ? a.weight : undefined,
          gear:
            a.bikes || a.shoes
              ? { bikes: a.bikes ?? [], shoes: a.shoes ?? [] }
              : undefined,
        }).catch((e) => console.error("Failed to cache athlete details:", e));
      }

      return jsonResponseWithCookies(athlete, newCookies);
    } catch (error) {
      console.error("Athlete fetch error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "UNAUTHORIZED") {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      return jsonResponse({ error: "Failed to fetch athlete" }, 500);
    }
  });
}
