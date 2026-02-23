import type { Context } from "@netlify/functions";
import {
  withAuth,
  jsonResponseWithCookies,
  jsonResponse,
  parseTokensFromCookies,
  handleCorsPreFlight,
  getCorsHeaders,
} from "./lib/strava.js";
import {
  getWeeklyReport,
  upsertWeeklyReport,
} from "./lib/db.js";

export default async function handler(request: Request, _context: Context) {
  if (request.method === "OPTIONS") {
    return handleCorsPreFlight();
  }

  const url = new URL(request.url);

  // GET /api/weekly-reports?week=YYYY-MM-DD
  if (request.method === "GET") {
    return withAuth(request, async (req, _accessToken, newCookies) => {
      try {
        const cookieHeader = req.headers.get("cookie");
        const { athleteId } = parseTokensFromCookies(cookieHeader);

        if (!athleteId) {
          return jsonResponse({ error: "No athlete ID" }, 400);
        }

        const weekParam = url.searchParams.get("week");
        if (!weekParam) {
          return jsonResponse(
            { error: "Week parameter required (YYYY-MM-DD)" },
            400,
          );
        }

        const report = await getWeeklyReport(athleteId, weekParam);
        return jsonResponseWithCookies({ report }, newCookies);
      } catch (error) {
        console.error("GET weekly report error:", error);
        return jsonResponse({ error: "Failed to fetch weekly report" }, 500);
      }
    });
  }

  // PUT /api/weekly-reports — upsert a report
  if (request.method === "PUT") {
    return withAuth(request, async (req, _accessToken, newCookies) => {
      try {
        const cookieHeader = req.headers.get("cookie");
        const { athleteId } = parseTokensFromCookies(cookieHeader);

        if (!athleteId) {
          return jsonResponse({ error: "No athlete ID" }, 400);
        }

        const body = await req.json();
        const { weekStart, title, markdown } = body;

        if (!weekStart || !title || !markdown) {
          return jsonResponse(
            { error: "weekStart, title, and markdown are required" },
            400,
          );
        }

        const report = await upsertWeeklyReport(
          athleteId,
          weekStart,
          title,
          markdown,
        );
        return jsonResponseWithCookies({ report }, newCookies);
      } catch (error) {
        console.error("PUT weekly report error:", error);
        return jsonResponse({ error: "Failed to save weekly report" }, 500);
      }
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(),
    },
  });
}
