import type { Context } from "@netlify/functions";
import {
  parseTokensFromCookies,
  refreshAccessToken,
  createTokenCookies,
  handleCorsPreFlight,
  jsonResponse,
  getCorsHeaders,
} from "./lib/strava.js";
import { updateUserTokens } from "./lib/db.js";

export default async function handler(request: Request, _context: Context) {
  if (request.method === "OPTIONS") {
    return handleCorsPreFlight();
  }

  try {
    // PWA Support: Accept refresh token from request body
    // PWAs have isolated cookie storage, so they send tokens via body
    let refreshToken: string | null = null;
    let athleteId: number | null = null;

    // Try to get refresh token from request body first (PWA mode)
    if (request.method === "POST") {
      try {
        const body = await request.clone().json();
        if (body.refreshToken) {
          refreshToken = body.refreshToken;
        }
      } catch {
        // No JSON body, fall through to cookie parsing
      }
    }

    // Fall back to cookies if no body token
    if (!refreshToken) {
      const cookieHeader = request.headers.get("cookie");
      const parsed = parseTokensFromCookies(cookieHeader);
      refreshToken = parsed.refreshToken;
      athleteId = parsed.athleteId;
    }

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

    // Use Headers object to properly set multiple Set-Cookie headers
    const headers = new Headers({
      "Content-Type": "application/json",
      ...getCorsHeaders(),
    });
    cookies.forEach((cookie) => headers.append("Set-Cookie", cookie));

    // Return tokens in response body for PWA clients to update localStorage
    return new Response(JSON.stringify({
      success: true,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at,
    }), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Refresh error:", error);
    return jsonResponse({ error: "Token refresh failed" }, 401);
  }
}
