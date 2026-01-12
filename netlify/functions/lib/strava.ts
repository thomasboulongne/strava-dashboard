// Strava API helper functions for Netlify Functions

const STRAVA_API_BASE = "https://www.strava.com/api/v3";
const STRAVA_OAUTH_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

export const getClientId = () => process.env.STRAVA_CLIENT_ID!;
export const getClientSecret = () => process.env.STRAVA_CLIENT_SECRET!;

// CORS headers for local development
export function getCorsHeaders(): Record<string, string> {
  // In development, allow localhost origins
  const allowedOrigin = process.env.SITE_URL || "http://localhost:5173";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
  };
}

export function handleCorsPreFlight(): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

// Get the site URL - uses Netlify's built-in env vars in production
export const getSiteUrl = () => {
  // Explicit override takes priority
  if (process.env.SITE_URL) {
    return process.env.SITE_URL;
  }
  // Netlify deploy preview URL
  if (process.env.DEPLOY_PRIME_URL) {
    return process.env.DEPLOY_PRIME_URL;
  }
  // Netlify production URL
  if (process.env.URL) {
    return process.env.URL;
  }
  // Local development fallback
  return "http://localhost:8888";
};

export function getAuthorizationUrl(): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: `${getSiteUrl()}/api/callback`,
    response_type: "code",
    scope: "read,activity:read_all,profile:read_all",
    approval_prompt: "auto",
  });

  return `${STRAVA_OAUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string) {
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json();
}

export async function refreshAccessToken(refreshToken: string) {
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  return response.json();
}

export async function fetchFromStrava(
  endpoint: string,
  accessToken: string,
  params?: Record<string, string>
) {
  const url = new URL(`${STRAVA_API_BASE}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("UNAUTHORIZED");
    }
    const error = await response.text();
    throw new Error(`Strava API error: ${error}`);
  }

  return response.json();
}

// Cookie helpers
export function parseTokensFromCookies(cookieHeader: string | null): {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  athleteId: number | null;
} {
  if (!cookieHeader) {
    return {
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      athleteId: null,
    };
  }

  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...rest] = c.trim().split("=");
      return [key, rest.join("=")];
    })
  );

  return {
    accessToken: cookies["strava_access_token"] || null,
    refreshToken: cookies["strava_refresh_token"] || null,
    expiresAt: cookies["strava_expires_at"]
      ? parseInt(cookies["strava_expires_at"])
      : null,
    athleteId: cookies["strava_athlete_id"]
      ? parseInt(cookies["strava_athlete_id"])
      : null,
  };
}

export function createTokenCookies(
  accessToken: string,
  refreshToken: string,
  expiresAt: number,
  athleteId?: number
): string[] {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const sameSite = "; SameSite=Lax";
  const path = "; Path=/";
  const httpOnly = "; HttpOnly";

  // Access token expires when the Strava token expires
  const accessTokenMaxAge = Math.max(
    0,
    expiresAt - Math.floor(Date.now() / 1000)
  );
  // Refresh token lasts longer (30 days)
  const refreshTokenMaxAge = 30 * 24 * 60 * 60;

  const cookies = [
    `strava_access_token=${accessToken}; Max-Age=${accessTokenMaxAge}${httpOnly}${secure}${sameSite}${path}`,
    `strava_refresh_token=${refreshToken}; Max-Age=${refreshTokenMaxAge}${httpOnly}${secure}${sameSite}${path}`,
    `strava_expires_at=${expiresAt}; Max-Age=${accessTokenMaxAge}${secure}${sameSite}${path}`,
  ];

  // Include athlete ID cookie if provided (needed for DB token updates)
  if (athleteId) {
    cookies.push(
      `strava_athlete_id=${athleteId}; Max-Age=${refreshTokenMaxAge}${secure}${sameSite}${path}`
    );
  }

  return cookies;
}

export function createLogoutCookies(): string[] {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const sameSite = "; SameSite=Lax";
  const path = "; Path=/";
  const httpOnly = "; HttpOnly";

  return [
    `strava_access_token=; Max-Age=0${httpOnly}${secure}${sameSite}${path}`,
    `strava_refresh_token=; Max-Age=0${httpOnly}${secure}${sameSite}${path}`,
    `strava_expires_at=; Max-Age=0${secure}${sameSite}${path}`,
    `strava_athlete_id=; Max-Age=0${secure}${sameSite}${path}`,
  ];
}

// JSON response helper
export function jsonResponse(
  data: unknown,
  status: number,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(),
      ...extraHeaders,
    },
  });
}

// Authenticated endpoint handler type
type AuthenticatedHandler = (
  request: Request,
  accessToken: string,
  newCookies: string[] | null
) => Promise<Response>;

// Wrapper for authenticated Strava API endpoints
export async function withAuth(
  request: Request,
  handler: AuthenticatedHandler
): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return handleCorsPreFlight();
  }

  try {
    const cookieHeader = request.headers.get("cookie");
    const {
      accessToken: initialAccessToken,
      refreshToken,
      expiresAt,
      athleteId,
    } = parseTokensFromCookies(cookieHeader);

    if (!initialAccessToken && !refreshToken) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    let accessToken = initialAccessToken;
    let newCookies: string[] | null = null;

    // Check if token is expired, about to expire (within 5 minutes), OR missing
    // This handles the case where the access_token cookie has been deleted by the browser
    // but the refresh_token (30-day lifetime) is still valid
    const now = Math.floor(Date.now() / 1000);
    const needsRefresh = !accessToken || (expiresAt && expiresAt - now < 300);

    if (needsRefresh && refreshToken) {
      try {
        const tokens = await refreshAccessToken(refreshToken);
        accessToken = tokens.access_token;
        newCookies = createTokenCookies(
          tokens.access_token,
          tokens.refresh_token,
          tokens.expires_at,
          athleteId ?? undefined
        );
      } catch {
        return jsonResponse({ error: "Token refresh failed" }, 401);
      }
    }

    if (!accessToken) {
      return jsonResponse({ error: "No access token" }, 401);
    }

    return handler(request, accessToken, newCookies);
  } catch (error) {
    console.error("Auth wrapper error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message === "UNAUTHORIZED") {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    return jsonResponse({ error: "Request failed" }, 500);
  }
}

// Helper to build response with optional refreshed cookies
export function jsonResponseWithCookies(
  data: unknown,
  newCookies: string[] | null
): Response {
  // Use Headers object to properly set multiple Set-Cookie headers
  const headers = new Headers({
    "Content-Type": "application/json",
    ...getCorsHeaders(),
  });

  if (newCookies) {
    newCookies.forEach((cookie) => headers.append("Set-Cookie", cookie));
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers,
  });
}
