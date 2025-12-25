import type { Context } from "@netlify/functions";
import { exchangeCodeForTokens, createTokenCookies, getSiteUrl } from "./lib/strava.js";

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
      return new Response(JSON.stringify({ error: "No authorization code provided" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    const tokens = await exchangeCodeForTokens(code);
    const cookies = createTokenCookies(
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_at
    );

    // Redirect to dashboard with cookies set
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${getSiteUrl()}/dashboard`,
        "Set-Cookie": cookies.join(", "),
      },
    });
  } catch (error) {
    console.error("Callback error:", error);
    return Response.redirect(`${getSiteUrl()}/?error=auth_failed`, 302);
  }
}

