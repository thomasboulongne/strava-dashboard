import type { Context } from "@netlify/functions";
import {
  withAuth,
  jsonResponseWithCookies,
  jsonResponse,
  parseTokensFromCookies,
  handleCorsPreFlight,
} from "./lib/strava.js";
import {
  getObjectives,
  getObjectiveById,
  createObjective,
  updateObjective,
  deleteObjectiveById,
  type DbObjective,
} from "./lib/db.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OBJECTIVE_TYPES = ["race", "test", "milestone", "camp", "note"];
const PRIORITIES = ["A", "B", "C"];

// Format a DATE column (or ISO string) as YYYY-MM-DD, avoiding UTC shift when
// PostgreSQL returns midnight-local Date objects that serialize to UTC.
function formatDateString(date: Date | string | null): string | null {
  if (date === null) return null;
  if (typeof date === "string") return date.split("T")[0];
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Shape objective rows for the client (string dates, no timezone surprises).
function serializeObjective(o: DbObjective) {
  return {
    id: o.id,
    title: o.title,
    objective_type: o.objective_type,
    priority: o.priority,
    start_date: formatDateString(o.start_date),
    end_date: formatDateString(o.end_date),
    notes: o.notes,
  };
}

export default async function handler(request: Request, _context: Context) {
  if (request.method === "OPTIONS") {
    return handleCorsPreFlight();
  }

  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const lastPart = pathParts[pathParts.length - 1];
  const idFromPath =
    lastPart && lastPart !== "objectives" ? parseInt(lastPart, 10) : NaN;

  // GET /api/objectives?from=&to=  -> list objectives (optionally range-filtered)
  if (request.method === "GET") {
    return withAuth(request, async (req, _accessToken, newCookies) => {
      try {
        const { athleteId } = parseTokensFromCookies(req.headers.get("cookie"));
        if (!athleteId) return jsonResponse({ error: "No athlete ID" }, 400);

        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        if (from && !DATE_RE.test(from)) {
          return jsonResponse({ error: "from must be YYYY-MM-DD" }, 400);
        }
        if (to && !DATE_RE.test(to)) {
          return jsonResponse({ error: "to must be YYYY-MM-DD" }, 400);
        }

        const objectives = await getObjectives(athleteId, from, to);
        return jsonResponseWithCookies(
          { objectives: objectives.map(serializeObjective) },
          newCookies,
        );
      } catch (error) {
        console.error("GET objectives error:", error);
        return jsonResponse({ error: "Failed to fetch objectives" }, 500);
      }
    });
  }

  // POST /api/objectives  -> create an objective
  if (request.method === "POST") {
    return withAuth(request, async (req, _accessToken, newCookies) => {
      try {
        const { athleteId } = parseTokensFromCookies(req.headers.get("cookie"));
        if (!athleteId) return jsonResponse({ error: "No athlete ID" }, 400);

        const body = await req.json();
        const validation = validateObjectiveBody(body, { requireAll: true });
        if (validation.error) {
          return jsonResponse({ error: validation.error }, 400);
        }

        const created = await createObjective({
          athlete_id: athleteId,
          title: validation.title!,
          objective_type: validation.objective_type!,
          priority: validation.priority ?? null,
          start_date: validation.start_date!,
          end_date: validation.end_date ?? null,
          notes: validation.notes ?? null,
        });

        return jsonResponseWithCookies(
          { success: true, objective: serializeObjective(created) },
          newCookies,
        );
      } catch (error) {
        console.error("POST objective error:", error);
        return jsonResponse({ error: "Failed to create objective" }, 500);
      }
    });
  }

  // PATCH /api/objectives/:id  -> update an objective (merges with existing)
  if (request.method === "PATCH" && !isNaN(idFromPath)) {
    return withAuth(request, async (req, _accessToken, newCookies) => {
      try {
        const { athleteId } = parseTokensFromCookies(req.headers.get("cookie"));
        if (!athleteId) return jsonResponse({ error: "No athlete ID" }, 400);

        const existing = await getObjectiveById(idFromPath);
        if (!existing || Number(existing.athlete_id) !== athleteId) {
          return jsonResponse({ error: "Objective not found" }, 404);
        }

        const body = await req.json();
        const validation = validateObjectiveBody(body, { requireAll: false });
        if (validation.error) {
          return jsonResponse({ error: validation.error }, 400);
        }

        // Merge provided fields over the existing row (undefined = keep).
        const updated = await updateObjective(idFromPath, {
          title: validation.title ?? existing.title,
          objective_type:
            validation.objective_type ?? existing.objective_type,
          priority:
            body.priority === undefined
              ? existing.priority
              : (validation.priority ?? null),
          start_date:
            validation.start_date ?? formatDateString(existing.start_date)!,
          end_date:
            body.end_date === undefined
              ? formatDateString(existing.end_date)
              : (validation.end_date ?? null),
          notes:
            body.notes === undefined ? existing.notes : (validation.notes ?? null),
        });

        return jsonResponseWithCookies(
          { success: true, objective: serializeObjective(updated!) },
          newCookies,
        );
      } catch (error) {
        console.error("PATCH objective error:", error);
        return jsonResponse({ error: "Failed to update objective" }, 500);
      }
    });
  }

  // DELETE /api/objectives/:id  -> delete an objective
  if (request.method === "DELETE" && !isNaN(idFromPath)) {
    return withAuth(request, async (req, _accessToken, newCookies) => {
      try {
        const { athleteId } = parseTokensFromCookies(req.headers.get("cookie"));
        if (!athleteId) return jsonResponse({ error: "No athlete ID" }, 400);

        const existing = await getObjectiveById(idFromPath);
        if (!existing || Number(existing.athlete_id) !== athleteId) {
          return jsonResponse({ error: "Objective not found" }, 404);
        }

        await deleteObjectiveById(idFromPath);
        return jsonResponseWithCookies({ success: true }, newCookies);
      } catch (error) {
        console.error("DELETE objective error:", error);
        return jsonResponse({ error: "Failed to delete objective" }, 500);
      }
    });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
}

// Validate + normalize an objective request body. When requireAll is true
// (create), the required fields must be present; otherwise only the provided
// fields are validated (partial update).
function validateObjectiveBody(
  body: Record<string, unknown>,
  opts: { requireAll: boolean },
): {
  error?: string;
  title?: string;
  objective_type?: string;
  priority?: string | null;
  start_date?: string;
  end_date?: string | null;
  notes?: string | null;
} {
  const out: ReturnType<typeof validateObjectiveBody> = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return { error: "title must be a non-empty string" };
    }
    out.title = body.title.trim();
  } else if (opts.requireAll) {
    return { error: "title is required" };
  }

  if (body.objective_type !== undefined) {
    if (
      typeof body.objective_type !== "string" ||
      !OBJECTIVE_TYPES.includes(body.objective_type)
    ) {
      return {
        error: `objective_type must be one of: ${OBJECTIVE_TYPES.join(", ")}`,
      };
    }
    out.objective_type = body.objective_type;
  } else if (opts.requireAll) {
    return { error: "objective_type is required" };
  }

  if (body.start_date !== undefined) {
    if (typeof body.start_date !== "string" || !DATE_RE.test(body.start_date)) {
      return { error: "start_date must be YYYY-MM-DD" };
    }
    out.start_date = body.start_date;
  } else if (opts.requireAll) {
    return { error: "start_date is required" };
  }

  if (body.priority !== undefined && body.priority !== null) {
    if (
      typeof body.priority !== "string" ||
      !PRIORITIES.includes(body.priority)
    ) {
      return { error: `priority must be one of: ${PRIORITIES.join(", ")}` };
    }
    out.priority = body.priority;
  } else if (body.priority === null) {
    out.priority = null;
  }

  if (body.end_date !== undefined && body.end_date !== null) {
    if (typeof body.end_date !== "string" || !DATE_RE.test(body.end_date)) {
      return { error: "end_date must be YYYY-MM-DD" };
    }
    out.end_date = body.end_date;
  } else if (body.end_date === null) {
    out.end_date = null;
  }

  // end_date must not precede start_date when both are known.
  const effectiveStart = out.start_date;
  if (out.end_date && effectiveStart && out.end_date < effectiveStart) {
    return { error: "end_date must be on or after start_date" };
  }

  if (body.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return { error: "notes must be a string or null" };
    }
    out.notes = (body.notes as string | null) ?? null;
  }

  return out;
}
