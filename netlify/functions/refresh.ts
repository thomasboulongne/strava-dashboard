import type { Context } from "@netlify/functions";
import {
  parseTokensFromCookies,
  refreshAccessToken,
  createTokenCookies,
  handleCorsPreFlight,
  jsonResponse,
} from "./lib/strava.js";
import { updateUserTokens } from "./lib/db.js";

export default async function handler(request: Request, _context: Context) {
  if (request.method === "OPTIONS") {
    return handleCorsPreFlight();
  }

  try {
    const cookieHeader = request.headers.get("cookie");
    const { refreshToken, athleteId } = parseTokensFromCookies(cookieHeader);

    if (!refreshToken) {
      return jsonResponse({ error: "No refresh token" }, 401);
    }

    const tokens = await refreshAccessToken(refreshToken);

    // Update tokens in database if we can identify the user
    if (athleteId) {
      try {
        await updateUserTokens(
          athleteId,
          tokens.access_token,
          tokens.refresh_token,
          tokens.expires_at
        );
      } catch (dbError) {
        // Log but don't fail - cookies still work as fallback
        console.error("Failed to update tokens in DB:", dbError);
      }
    }

    const cookies = createTokenCookies(
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_at,
      athleteId ?? undefined
    );

    return jsonResponse({ success: true }, 200, {
      "Set-Cookie": cookies.join(", "),
    });
  } catch (error) {
    console.error("Refresh error:", error);
    return jsonResponse({ error: "Token refresh failed" }, 401);
  }
}
