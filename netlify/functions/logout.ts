import type { Context } from "@netlify/functions";
import { createLogoutCookies, getSiteUrl } from "./lib/strava.js";

export default async function handler(_request: Request, _context: Context) {
  const cookies = createLogoutCookies();

  // Use Headers object to properly set multiple Set-Cookie headers
  const headers = new Headers();
  headers.set("Location", getSiteUrl());
  cookies.forEach((cookie) => headers.append("Set-Cookie", cookie));

  return new Response(null, {
    status: 302,
    headers,
  });
}
