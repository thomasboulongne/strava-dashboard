import type { Context } from "@netlify/functions";
import {
  parseTokensFromCookies,
  fetchFromStrava,
  refreshAccessToken,
  createTokenCookies,
} from "./lib/strava.js";

export default async function handler(request: Request, _context: Context) {
  try {
    const url = new URL(request.url);
    const page = url.searchParams.get("page") || "1";
    const perPage = url.searchParams.get("per_page") || "30";

    const cookieHeader = request.headers.get("cookie");
    let { accessToken, refreshToken, expiresAt } = parseTokensFromCookies(cookieHeader);

    if (!accessToken && !refreshToken) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    let newCookies: string[] | null = null;

    // Check if token is expired or about to expire
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt && expiresAt - now < 300 && refreshToken) {
      try {
        const tokens = await refreshAccessToken(refreshToken);
        accessToken = tokens.access_token;
        refreshToken = tokens.refresh_token;
        expiresAt = tokens.expires_at;
        newCookies = createTokenCookies(accessToken, refreshToken, expiresAt);
      } catch {
        return new Response(JSON.stringify({ error: "Token refresh failed" }), {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "No access token" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    const activities = await fetchFromStrava("/athlete/activities", accessToken, {
      page,
      per_page: perPage,
    });

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (newCookies) {
      headers["Set-Cookie"] = newCookies.join(", ");
    }

    return new Response(JSON.stringify(activities), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Activities fetch error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message === "UNAUTHORIZED") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    return new Response(JSON.stringify({ error: "Failed to fetch activities" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}

