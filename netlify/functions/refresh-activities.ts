// Manual "refresh recent details" endpoint. Re-fetches the DetailedActivity
// JSON for the athlete's recent activities so owner-only edits that never fire
// webhooks - private notes, descriptions, renames - show up in Dashy and the
// MCP server. Triggered by the refresh button on the web and iOS clients.
import type { Context } from "@netlify/functions";
import {
  withAuth,
  jsonResponse,
  jsonResponseWithCookies,
  parseTokensFromCookies,
} from "./lib/strava.js";
import { getValidAccessToken } from "./lib/strava-api.js";
import { refreshRecentMetadata } from "./lib/refresh.js";

export default async function handler(request: Request, _context: Context) {
  const cookieHeader = request.headers.get("cookie");
  const { athleteId } = parseTokensFromCookies(cookieHeader);

  if (!athleteId) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  return withAuth(request, async (_req, _accessToken, newCookies) => {
    const validToken = await getValidAccessToken(athleteId);
    if (!validToken) {
      return jsonResponseWithCookies(
        { error: "Could not get valid access token", status: "failed" },
        newCookies,
      );
    }

    const result = await refreshRecentMetadata(athleteId, validToken);

    return jsonResponseWithCookies(
      {
        status: result.paused ? "paused" : "completed",
        refreshed: result.refreshed,
        failed: result.failed,
        rateLimit: result.rateLimit,
      },
      newCookies,
    );
  });
}
