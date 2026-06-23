import type { Context } from "@netlify/functions";
import {
  fetchFromStrava,
  withAuth,
  jsonResponseWithCookies,
  jsonResponse,
} from "./lib/strava.js";
import { updateUserFtp } from "./lib/db.js";

export default async function handler(request: Request, _context: Context) {
  return withAuth(request, async (_req, accessToken, newCookies) => {
    try {
      const athlete = await fetchFromStrava("/athlete", accessToken);

      // Cache FTP for the MCP server (best-effort, non-blocking on failure).
      const ftp = (athlete as { id?: number; ftp?: number }).ftp;
      const athleteId = (athlete as { id?: number }).id;
      if (typeof ftp === "number" && ftp > 0 && typeof athleteId === "number") {
        updateUserFtp(athleteId, ftp).catch((e) =>
          console.error("Failed to cache FTP:", e),
        );
      }

      return jsonResponseWithCookies(athlete, newCookies);
    } catch (error) {
      console.error("Athlete fetch error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "UNAUTHORIZED") {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      return jsonResponse({ error: "Failed to fetch athlete" }, 500);
    }
  });
}
