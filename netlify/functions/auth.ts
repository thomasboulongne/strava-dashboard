import type { Context } from "@netlify/functions";
import { getAuthorizationUrl, jsonResponse } from "./lib/strava.js";

export default async function handler(request: Request, _context: Context) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    const { handleCorsPreFlight } = await import("./lib/strava.js");
    return handleCorsPreFlight();
  }

  try {
    const authUrl = getAuthorizationUrl();
    return jsonResponse({ url: authUrl }, 200);
  } catch (error) {
    console.error("Auth error:", error);
    return jsonResponse({ error: "Failed to generate authorization URL" }, 500);
  }
}
