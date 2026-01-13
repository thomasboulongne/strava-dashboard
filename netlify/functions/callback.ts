import type { Context } from "@netlify/functions";
import {
  exchangeCodeForTokens,
  createTokenCookies,
  getSiteUrl,
} from "./lib/strava.js";
import { upsertUser } from "./lib/db.js";

export default async function handler(request: Request, _context: Context) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
      // User denied access
      return Response.redirect(`${getSiteUrl()}/?error=access_denied`, 302);
    }

    if (!code) {
      return new Response(
        JSON.stringify({ error: "No authorization code provided" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const tokens = await exchangeCodeForTokens(code);

    // Store user and tokens in database
    const athlete = tokens.athlete;
    await upsertUser({
      id: athlete.id,
      username: athlete.username,
      firstname: athlete.firstname,
      lastname: athlete.lastname,
      profile: athlete.profile,
      profile_medium: athlete.profile_medium,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: tokens.expires_at,
    });

    // Note: We don't create a sync job here anymore.
    // The dashboard will check if activities need to be synced by comparing
    // our latest activity date with Strava's. This is more efficient since
    // webhooks keep us up-to-date after the initial sync.

    const cookies = createTokenCookies(
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_at,
      athlete.id
    );

    // Redirect to dashboard with cookies set
    // The dashboard will trigger the sync process
    // Use Headers.append() to properly set multiple Set-Cookie headers
    const headers = new Headers();

    // For PWA support: pass session data via URL hash
    // PWAs have isolated cookie storage, so we pass tokens in the URL
    // The hash fragment (#) is not sent to the server, keeping it private
    const sessionData = Buffer.from(JSON.stringify({
      athleteId: athlete.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at
    })).toString('base64');

    headers.set("Location", `${getSiteUrl()}/dashboard#session=${sessionData}`);
    cookies.forEach((cookie) => headers.append("Set-Cookie", cookie));

    return new Response(null, {
      status: 302,
      headers,
    });
  } catch (error) {
    console.error("Callback error:", error);
    return Response.redirect(`${getSiteUrl()}/?error=auth_failed`, 302);
  }
}
