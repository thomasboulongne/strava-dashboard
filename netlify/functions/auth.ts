import type { Context } from "@netlify/functions";
import { getAuthorizationUrl } from "./lib/strava.js";

export default async function handler(_request: Request, _context: Context) {
  try {
    const authUrl = getAuthorizationUrl();

    return new Response(JSON.stringify({ url: authUrl }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Auth error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate authorization URL" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

