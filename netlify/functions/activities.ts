import type { Context } from "@netlify/functions";
import {
  fetchFromStrava,
  withAuth,
  jsonResponseWithCookies,
  jsonResponse,
} from "./lib/strava.js";

export default async function handler(request: Request, _context: Context) {
  return withAuth(request, async (req, accessToken, newCookies) => {
    try {
      const url = new URL(req.url);
      const page = url.searchParams.get("page") || "1";
      const perPage = url.searchParams.get("per_page") || "30";

      const activities = await fetchFromStrava("/athlete/activities", accessToken, {
        page,
        per_page: perPage,
      });
      return jsonResponseWithCookies(activities, newCookies);
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
