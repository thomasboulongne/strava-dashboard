import type { Context } from "@netlify/functions";
import {
  parseTokensFromCookies,
  refreshAccessToken,
  createTokenCookies,
  handleCorsPreFlight,
  jsonResponse,
} from "./lib/strava.js";

export default async function handler(request: Request, _context: Context) {
  if (request.method === "OPTIONS") {
    return handleCorsPreFlight();
  }

  try {
    const cookieHeader = request.headers.get("cookie");
    const { refreshToken } = parseTokensFromCookies(cookieHeader);

    if (!refreshToken) {
      return jsonResponse({ error: "No refresh token" }, 401);
    }

    const tokens = await refreshAccessToken(refreshToken);
    const cookies = createTokenCookies(
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_at
    );

    return jsonResponse({ success: true }, 200, {
      "Set-Cookie": cookies.join(", "),
    });
  } catch (error) {
    console.error("Refresh error:", error);
    return jsonResponse({ error: "Token refresh failed" }, 401);
  }
}
