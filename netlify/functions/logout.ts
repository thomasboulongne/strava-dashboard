import type { Context } from "@netlify/functions";
import { createLogoutCookies, getSiteUrl } from "./lib/strava.js";

export default async function handler(_request: Request, _context: Context) {
  const cookies = createLogoutCookies();

  return new Response(null, {
    status: 302,
    headers: {
      Location: getSiteUrl(),
      "Set-Cookie": cookies.join(", "),
    },
  });
}

