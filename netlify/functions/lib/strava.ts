// Strava API helper functions for Netlify Functions

const STRAVA_API_BASE = "https://www.strava.com/api/v3";
const STRAVA_OAUTH_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

export const getClientId = () => process.env.STRAVA_CLIENT_ID!;
export const getClientSecret = () => process.env.STRAVA_CLIENT_SECRET!;
export const getSiteUrl = () => process.env.SITE_URL || "http://localhost:8888";

export function getAuthorizationUrl(): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: `${getSiteUrl()}/callback`,
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
export function parseTokensFromCookies(
  cookieHeader: string | null
): { accessToken: string | null; refreshToken: string | null; expiresAt: number | null } {
  if (!cookieHeader) {
    return { accessToken: null, refreshToken: null, expiresAt: null };
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
    expiresAt: cookies["strava_expires_at"] ? parseInt(cookies["strava_expires_at"]) : null,
  };
}

export function createTokenCookies(
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): string[] {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const sameSite = "; SameSite=Lax";
  const path = "; Path=/";
  const httpOnly = "; HttpOnly";

  // Access token expires when the Strava token expires
  const accessTokenMaxAge = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
  // Refresh token lasts longer (30 days)
  const refreshTokenMaxAge = 30 * 24 * 60 * 60;

  return [
    `strava_access_token=${accessToken}; Max-Age=${accessTokenMaxAge}${httpOnly}${secure}${sameSite}${path}`,
    `strava_refresh_token=${refreshToken}; Max-Age=${refreshTokenMaxAge}${httpOnly}${secure}${sameSite}${path}`,
    `strava_expires_at=${expiresAt}; Max-Age=${accessTokenMaxAge}${secure}${sameSite}${path}`,
  ];
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
  ];
}

