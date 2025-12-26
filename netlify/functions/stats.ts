import type { Context } from "@netlify/functions";
import {
  fetchFromStrava,
  withAuth,
  jsonResponseWithCookies,
  jsonResponse,
} from "./lib/strava.js";

export default async function handler(request: Request, _context: Context) {
  return withAuth(request, async (req, accessToken, newCookies) => {
    const url = new URL(req.url);
    const athleteId = url.searchParams.get("athleteId");

    if (!athleteId) {
      return jsonResponse({ error: "athleteId is required" }, 400);
    }

    try {
      const stats = await fetchFromStrava(`/athletes/${athleteId}/stats`, accessToken);
      return jsonResponseWithCookies(stats, newCookies);
    } catch (error) {
      console.error("Stats fetch error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "UNAUTHORIZED") {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      return jsonResponse({ error: "Failed to fetch stats" }, 500);
    }
  });
}
