// Remote MCP endpoint for ChatGPT (developer-mode connector).
// Stateless Streamable HTTP transport over Web Standard Request/Response.
// Read-only access to the athlete's stored Strava data.
import type { Context } from "@netlify/functions";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildServer } from "./lib/mcp-server.js";
import { getApiKey, touchApiKey } from "./lib/db.js";

// Extract the per-user key from the request. ChatGPT "No Authentication"
// connectors can only carry the secret in the URL, so the query param is the
// primary channel; Bearer / x-mcp-secret are supported for other MCP clients.
function extractKey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);

  const headerSecret = request.headers.get("x-mcp-secret");
  if (headerSecret) return headerSecret;

  const url = new URL(request.url);
  return url.searchParams.get("key");
}

// Resolve which athlete this request is for, based on the per-user key.
// Falls back to MCP_ATHLETE_ID only for local development (no key provided).
async function resolveRequestAthlete(request: Request): Promise<number | null> {
  const key = extractKey(request);

  if (!key) {
    const devAthlete = process.env.MCP_ATHLETE_ID;
    return devAthlete ? parseInt(devAthlete, 10) : null;
  }

  const apiKey = await getApiKey(key);
  if (!apiKey) return null;

  // Fire-and-forget usage timestamp update.
  touchApiKey(key).catch(() => {});
  return Number(apiKey.athlete_id);
}

export default async function handler(request: Request, _context: Context) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, Mcp-Session-Id, Mcp-Method, Mcp-Name, MCP-Protocol-Version, x-mcp-secret",
      },
    });
  }

  // This is a stateless Streamable HTTP server (JSON responses, no session),
  // so there is no server->client SSE channel. Reject the GET/DELETE that
  // clients use to open/close that stream; otherwise the transport leaves the
  // GET open and the function hangs until it times out. Clients fall back to
  // plain POST + JSON, which is all we use.
  if (request.method === "GET" || request.method === "DELETE") {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed (use POST)" },
        id: null,
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          Allow: "POST, OPTIONS",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  // Short correlation id so we can follow a single request through the logs.
  const reqId = Math.random().toString(36).slice(2, 8);
  const t0 = Date.now();

  // Peek the JSON-RPC method / tool name for debugging (clone so the original
  // request body stays intact for the transport).
  let rpcInfo = "";
  if (request.method === "POST") {
    try {
      const peeked = (await request.clone().json()) as {
        method?: string;
        params?: { name?: string };
      };
      rpcInfo = peeked?.params?.name
        ? `${peeked.method}:${peeked.params.name}`
        : String(peeked?.method ?? "");
    } catch {
      rpcInfo = "(unparsable body)";
    }
  }
  console.log(`[mcp ${reqId}] ${request.method} rpc=${rpcInfo || "-"}`);

  const athleteId = await resolveRequestAthlete(request);
  if (athleteId === null || Number.isNaN(athleteId)) {
    console.log(`[mcp ${reqId}] unauthorized (${Date.now() - t0}ms)`);
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized: invalid or missing MCP key" },
        id: null,
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  console.log(`[mcp ${reqId}] athlete=${athleteId} (${Date.now() - t0}ms)`);

  const server = buildServer(athleteId);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    console.log(`[mcp ${reqId}] handleRequest start (${Date.now() - t0}ms)`);
    const response = await transport.handleRequest(request);
    // Buffer the (JSON) body before tearing down the transport so the response
    // is fully materialized for the stateless, single-shot request.
    const body = await response.arrayBuffer();
    console.log(
      `[mcp ${reqId}] handleRequest done status=${response.status} bytes=${body.byteLength} (${Date.now() - t0}ms)`,
    );
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error(`[mcp ${reqId}] request error (${Date.now() - t0}ms):`, error);
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    await transport.close();
    await server.close();
    console.log(`[mcp ${reqId}] closed (${Date.now() - t0}ms)`);
  }
}

export const config = {
  path: "/mcp",
};
