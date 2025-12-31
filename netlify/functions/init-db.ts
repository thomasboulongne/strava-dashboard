// One-time database initialization endpoint
// Call this once to set up the database schema
import type { Context } from "@netlify/functions";
import { initializeSchema } from "./lib/db.js";
import { jsonResponse } from "./lib/strava.js";

export default async function handler(_request: Request, _context: Context) {
  try {
    await initializeSchema();
    return jsonResponse(
      { success: true, message: "Database schema initialized" },
      200
    );
  } catch (error) {
    console.error("Database initialization error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(
      { error: "Failed to initialize database", details: message },
      500
    );
  }
}
