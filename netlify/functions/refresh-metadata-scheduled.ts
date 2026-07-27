// Scheduled job that keeps recent activity metadata fresh for every connected
// athlete. Strava does not emit webhooks for private-note / description edits
// (only title, type, and privacy), so without this the notes an athlete adds
// after uploading from their Garmin would never make it into Dashy or the MCP
// server. Runs on a cron and re-fetches each athlete's recent DetailedActivity
// JSON (see lib/refresh.ts).
//
// Scheduled functions are capped at 30s and don't return a response body, so we
// keep a time budget and let the next run pick up anything we didn't reach.
import type { Config } from "@netlify/functions";
import { getAllUserIds } from "./lib/db.js";
import { getValidAccessToken } from "./lib/strava-api.js";
import { refreshRecentMetadata } from "./lib/refresh.js";

// Stop starting new athletes once we're this close to the 30s scheduled limit.
const TIME_BUDGET_MS = 25_000;

export default async function handler(_request: Request) {
  const startedAt = Date.now();
  const userIds = await getAllUserIds();

  let processed = 0;
  let totalRefreshed = 0;

  for (const athleteId of userIds) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      console.warn(
        `[refresh-metadata] time budget reached; processed ${processed}/${userIds.length} athletes`,
      );
      break;
    }

    try {
      const token = await getValidAccessToken(athleteId);
      if (!token) {
        console.warn(`[refresh-metadata] no token for athlete ${athleteId}`);
        continue;
      }

      const result = await refreshRecentMetadata(athleteId, token);
      totalRefreshed += result.refreshed;
      processed++;

      if (result.paused) {
        console.warn(
          `[refresh-metadata] athlete ${athleteId} paused for rate limit after ${result.refreshed} activities`,
        );
      }
    } catch (err) {
      console.error(`[refresh-metadata] athlete ${athleteId} error:`, err);
    }
  }

  console.log(
    `[refresh-metadata] done: ${processed}/${userIds.length} athletes, ${totalRefreshed} activities refreshed (${Date.now() - startedAt}ms)`,
  );

  // Scheduled functions must not return a response body.
  return new Response(null, { status: 200 });
}

// Every 6 hours. Notes are usually added within a day of an upload, so this
// keeps them fresh without burning through Strava's rate limit. Override the
// window/cap via REFRESH_WINDOW_DAYS / REFRESH_MAX_ACTIVITIES env vars.
export const config: Config = {
  schedule: "0 */6 * * *",
};
