import type { Context } from "@netlify/functions";
import {
  fetchFromStrava,
  withAuth,
  jsonResponseWithCookies,
  jsonResponse,
} from "./lib/strava.js";

export default async function handler(request: Request, _context: Context) {
  return withAuth(request, async (_req, accessToken, newCookies) => {
    try {
      const athlete = await fetchFromStrava("/athlete", accessToken);
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
