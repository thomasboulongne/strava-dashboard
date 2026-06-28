// Strava Webhook Handler
// Handles both subscription validation (GET) and event notifications (POST)
import type { Context } from "@netlify/functions";
import {
  deleteActivity,
  deleteActivityStreams,
  deleteActivityZones,
} from "./lib/db.js";
import { jsonResponse, getCorsHeaders } from "./lib/strava.js";
import { getValidAccessToken } from "./lib/strava-api.js";
import { enrichActivity } from "./lib/enrich.js";

// Webhook event types from Strava
interface StravaWebhookEvent {
  object_type: "activity" | "athlete";
  object_id: number;
  aspect_type: "create" | "update" | "delete";
  owner_id: number; // Athlete ID
  subscription_id: number;
  event_time: number;
  updates?: Record<string, unknown>;
}

// Handle activity events
async function handleActivityEvent(event: StravaWebhookEvent): Promise<void> {
  const { object_id: activityId, aspect_type, owner_id: athleteId } = event;

  if (aspect_type === "delete") {
    // Delete the activity and its streams/zones from our database
    await deleteActivity(activityId);
    await deleteActivityStreams(activityId);
    await deleteActivityZones(activityId);
    console.log(`Webhook: Deleted activity ${activityId}`);
    return;
  }

  // For create and update, fully enrich the activity (detailed JSON + laps +
  // all streams + Strava zones) via the shared helper.
  const accessToken = await getValidAccessToken(athleteId);
  if (!accessToken) {
    console.error(
      `Webhook: Could not get access token for athlete ${athleteId}`
    );
    return;
  }

  const result = await enrichActivity(activityId, athleteId, accessToken, {
    isUpdate: aspect_type === "update",
  });

  if (!result.ok) {
    console.error(`Webhook: Could not enrich activity ${activityId}`);
    return;
  }

  console.log(
    `Webhook: ${
      aspect_type === "create" ? "Created" : "Updated"
    } activity ${activityId} (laps=${result.laps}, streams=[${result.streamTypes.join(
      ", "
    )}], zones=${result.zones})`
  );
}

// Handle athlete events (deauthorization, etc.)
async function handleAthleteEvent(event: StravaWebhookEvent): Promise<void> {
  const { aspect_type, owner_id: athleteId, updates } = event;

  if (aspect_type === "update" && updates?.authorized === "false") {
    // User has deauthorized our app - we could clean up their data here
    console.log(`Webhook: Athlete ${athleteId} has deauthorized the app`);
    // Note: You might want to delete user data here, or mark them as inactive
  }
}

export default async function handler(request: Request, _context: Context) {
  const url = new URL(request.url);

  // GET request = Subscription validation from Strava
  if (request.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = url.searchParams.get("hub.verify_token");

    const expectedToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;

    if (mode === "subscribe" && verifyToken === expectedToken && challenge) {
      console.log("Webhook: Subscription validation successful");
      // Return the challenge as JSON (Strava expects this format)
      return new Response(JSON.stringify({ "hub.challenge": challenge }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(),
        },
      });
    }

    console.error("Webhook: Subscription validation failed", {
      mode,
      verifyToken,
      expectedToken,
    });
    return jsonResponse({ error: "Validation failed" }, 403);
  }

  // POST request = Webhook event from Strava
  if (request.method === "POST") {
    try {
      const event: StravaWebhookEvent = await request.json();
      console.log("Webhook: Received event", JSON.stringify(event));

      // Strava expects a 200 response within 2 seconds
      // Process the event asynchronously after responding
      // Note: Netlify Functions have a 10s timeout, so we should be fine

      if (event.object_type === "activity") {
        await handleActivityEvent(event);
      } else if (event.object_type === "athlete") {
        await handleAthleteEvent(event);
      }

      return jsonResponse({ success: true }, 200);
    } catch (error) {
      console.error("Webhook: Error processing event", error);
      // Still return 200 to acknowledge receipt (Strava will retry otherwise)
      return jsonResponse({ success: true }, 200);
    }
  }

  // Unsupported method
  return jsonResponse({ error: "Method not allowed" }, 405);
}
