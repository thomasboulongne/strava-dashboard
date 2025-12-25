import type { Context } from "@netlify/functions";
import {
  parseTokensFromCookies,
  refreshAccessToken,
  createTokenCookies,
} from "./lib/strava.js";

export default async function handler(request: Request, _context: Context) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const { refreshToken } = parseTokensFromCookies(cookieHeader);

    if (!refreshToken) {
      return new Response(JSON.stringify({ error: "No refresh token" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    const tokens = await refreshAccessToken(refreshToken);
    const cookies = createTokenCookies(
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_at
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookies.join(", "),
      },
    });
  } catch (error) {
    console.error("Refresh error:", error);
    return new Response(JSON.stringify({ error: "Token refresh failed" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}

