// Strava API helpers for fetching data
// Separate from auth helpers to keep concerns isolated

import { getUserById, updateUserTokens, STREAM_TYPES_TO_FETCH } from "./db.js";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

// Rate limit info from response headers
export interface RateLimitInfo {
  limit15Min: number;
  limitDaily: number;
  usage15Min: number;
  usageDaily: number;
}

// Parse rate limit headers from Strava response
export function parseRateLimitHeaders(response: Response): RateLimitInfo {
  const limitHeader = response.headers.get("X-RateLimit-Limit") || "200,2000";
  const usageHeader = response.headers.get("X-RateLimit-Usage") || "0,0";

  const [limit15Min, limitDaily] = limitHeader.split(",").map(Number);
  const [usage15Min, usageDaily] = usageHeader.split(",").map(Number);

  return {
    limit15Min: limit15Min || 200,
    limitDaily: limitDaily || 2000,
    usage15Min: usage15Min || 0,
    usageDaily: usageDaily || 0,
  };
}

// Check if we should pause due to rate limits (80% threshold)
export function shouldPauseForRateLimit(rateLimit: RateLimitInfo, threshold = 0.8): boolean {
  const usage15MinRatio = rateLimit.usage15Min / rateLimit.limit15Min;
  const usageDailyRatio = rateLimit.usageDaily / rateLimit.limitDaily;
  return usage15MinRatio >= threshold || usageDailyRatio >= threshold;
}

// Get valid access token, refreshing if needed
export async function getValidAccessToken(userId: number): Promise<string | null> {
  const user = await getUserById(userId);
  if (!user) return null;

  const now = Math.floor(Date.now() / 1000);

  // Refresh if token expires in less than 5 minutes
  if (user.token_expires_at - now < 300) {
    try {
      const response = await fetch(STRAVA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          refresh_token: user.refresh_token,
          grant_type: "refresh_token",
        }),
      });

      if (!response.ok) return null;

      const tokens = await response.json();
      await updateUserTokens(userId, tokens.access_token, tokens.refresh_token, tokens.expires_at);
      return tokens.access_token;
    } catch {
      return null;
    }
  }

  return user.access_token;
}

// Fetch activity details from Strava
export async function fetchActivity(
  activityId: number,
  accessToken: string
): Promise<{ data: Record<string, unknown>; rateLimit: RateLimitInfo } | null> {
  try {
    const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.error(`Strava API: Failed to fetch activity ${activityId}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const rateLimit = parseRateLimitHeaders(response);
    return { data, rateLimit };
  } catch (error) {
    console.error(`Strava API: Error fetching activity ${activityId}:`, error);
    return null;
  }
}

// Stream data structure from Strava
interface StravaStreamData {
  type: string;
  data: number[] | [number, number][];
  series_type: string;
  original_size: number;
  resolution: string;
}

export interface ActivityStreamsResult {
  streams: Record<string, StravaStreamData>;
  streamTypes: string[];
  rateLimit: RateLimitInfo;
}

// Fetch activity streams from Strava
// By default fetches heartrate and watts, but can be configured
export async function fetchActivityStreams(
  activityId: number,
  accessToken: string,
  streamTypes: readonly string[] = STREAM_TYPES_TO_FETCH
): Promise<ActivityStreamsResult | null> {
  try {
    // Build the stream types query parameter
    // Always include 'time' as a reference for the other streams
    const typesToFetch = ["time", ...streamTypes].join(",");

    const url = new URL(`${STRAVA_API_BASE}/activities/${activityId}/streams`);
    url.searchParams.set("keys", typesToFetch);
    url.searchParams.set("key_by_type", "true");

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const rateLimit = parseRateLimitHeaders(response);

    if (!response.ok) {
      // 404 means no streams available (manual activity, etc.)
      if (response.status === 404) {
        return { streams: {}, streamTypes: [], rateLimit };
      }
      console.error(`Strava API: Failed to fetch streams for activity ${activityId}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // data is keyed by stream type
    const streams: Record<string, StravaStreamData> = data;
    const availableTypes = Object.keys(streams);

    return { streams, streamTypes: availableTypes, rateLimit };
  } catch (error) {
    console.error(`Strava API: Error fetching streams for activity ${activityId}:`, error);
    return null;
  }
}

// Check if an activity might have streams worth fetching
// (has heart rate or power data)
export function activityMightHaveStreams(activity: Record<string, unknown>): boolean {
  const hasHeartrate = activity.has_heartrate === true;
  const hasWatts = typeof activity.average_watts === "number" || activity.device_watts === true;
  return hasHeartrate || hasWatts;
}

// Fetch a page of activities from Strava
export async function fetchActivitiesPage(
  accessToken: string,
  page: number,
  perPage: number = 200
): Promise<{ activities: Record<string, unknown>[]; rateLimit: RateLimitInfo } | null> {
  try {
    const url = new URL(`${STRAVA_API_BASE}/athlete/activities`);
    url.searchParams.set("page", page.toString());
    url.searchParams.set("per_page", perPage.toString());

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      if (response.status === 429) {
        return { activities: [], rateLimit: parseRateLimitHeaders(response) };
      }
      console.error(`Strava API: Failed to fetch activities page ${page}: ${response.status}`);
      return null;
    }

    const activities = await response.json();
    const rateLimit = parseRateLimitHeaders(response);
    return { activities, rateLimit };
  } catch (error) {
    console.error(`Strava API: Error fetching activities page ${page}:`, error);
    return null;
  }
}

// Fetch detailed activity with laps from Strava
export async function fetchActivityWithLaps(
  activityId: number,
  accessToken: string
): Promise<{ activity: Record<string, unknown>; rateLimit: RateLimitInfo } | null> {
  try {
    const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.error(`Strava API: Failed to fetch activity ${activityId}: ${response.status}`);
      return null;
    }

    const activity = await response.json();
    const rateLimit = parseRateLimitHeaders(response);
    return { activity, rateLimit };
  } catch (error) {
    console.error(`Strava API: Error fetching activity ${activityId}:`, error);
    return null;
  }
}

// Extract laps from activity data
export function extractLaps(
  activity: Record<string, unknown>,
  athleteId: number
): Array<{
  id: number;
  activity_id: number;
  athlete_id: number;
  lap_index: number;
  data: Record<string, unknown>;
  start_date: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
}> | null {
  const laps = activity.laps as Record<string, unknown>[] | undefined;
  if (!laps || !Array.isArray(laps) || laps.length === 0) {
    return null;
  }

  const activityId = activity.id as number;

  return laps.map((lap) => ({
    id: lap.id as number,
    activity_id: activityId,
    athlete_id: athleteId,
    lap_index: lap.lap_index as number,
    data: lap,
    start_date: lap.start_date as string,
    elapsed_time: lap.elapsed_time as number,
    moving_time: lap.moving_time as number,
    distance: lap.distance as number,
  }));
}

