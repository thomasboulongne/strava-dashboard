// Self-serve management of per-user MCP API keys for the ChatGPT connector.
// GET    -> list the athlete's keys (with ready-to-paste connector URLs)
// POST   -> generate a new key
// DELETE -> revoke a key (?key=...)
import type { Context } from "@netlify/functions";
import { randomBytes } from "node:crypto";
import {
  withAuth,
  jsonResponse,
  jsonResponseWithCookies,
  parseTokensFromCookies,
  handleCorsPreFlight,
  getSiteUrl,
} from "./lib/strava.js";
import {
  getApiKeysForAthlete,
  createApiKey,
  deleteApiKey,
  type DbMcpApiKey,
} from "./lib/db.js";

function generateKey(): string {
  // URL-safe, ~43 chars of entropy. Lives in the connector URL.
  return randomBytes(32).toString("base64url");
}

function connectorUrl(key: string): string {
  return `${getSiteUrl()}/mcp?key=${key}`;
}

function serializeKey(row: DbMcpApiKey) {
  return {
    key: row.key,
    label: row.label,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    connectorUrl: connectorUrl(row.key),
  };
}

export default async function handler(request: Request, _context: Context) {
  if (request.method === "OPTIONS") {
    return handleCorsPreFlight();
  }

  return withAuth(request, async (req, _accessToken, newCookies) => {
    const cookieHeader = request.headers.get("cookie");
    const { athleteId } = parseTokensFromCookies(cookieHeader);

    if (!athleteId) {
      return jsonResponse({ error: "No athlete ID" }, 400);
    }

    try {
      if (request.method === "GET") {
        const keys = await getApiKeysForAthlete(athleteId);
        return jsonResponseWithCookies(
          { keys: keys.map(serializeKey) },
          newCookies,
        );
      }

      if (request.method === "POST") {
        const created = await createApiKey(athleteId, generateKey());
        return jsonResponseWithCookies(
          { key: serializeKey(created) },
          newCookies,
        );
      }

      if (request.method === "DELETE") {
        const url = new URL(req.url);
        const key = url.searchParams.get("key");
        if (!key) {
          return jsonResponse({ error: "Missing key parameter" }, 400);
        }
        const deleted = await deleteApiKey(athleteId, key);
        return jsonResponseWithCookies({ success: deleted }, newCookies);
      }

      return jsonResponse({ error: "Method not allowed" }, 405);
    } catch (error) {
      console.error("MCP key error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "UNAUTHORIZED") {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      return jsonResponse({ error: "Failed to manage MCP key" }, 500);
    }
  });
}
