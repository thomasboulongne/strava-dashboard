import type { Context } from "@netlify/functions";
import {
  withAuth,
  jsonResponseWithCookies,
  jsonResponse,
  parseTokensFromCookies,
  handleCorsPreFlight,
} from "./lib/strava.js";
import {
  getMacroPlans,
  getMacroPlanById,
  getActiveMacroPlan,
  getTrainingBlocksForPlan,
  createMacroPlan,
  updateMacroPlan,
  deleteMacroPlanById,
  deactivateOtherMacroPlans,
  getObjectiveById,
  getTrainingBlockById,
  createTrainingBlock,
  updateTrainingBlock,
  deleteTrainingBlockById,
  type DbMacroPlan,
  type DbTrainingBlock,
} from "./lib/db.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BLOCK_TYPES = ["base", "build", "peak", "taper", "recovery", "race"];

function formatDateString(date: Date | string | null): string | null {
  if (date === null) return null;
  if (typeof date === "string") return date.split("T")[0];
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function serializeBlock(b: DbTrainingBlock) {
  return {
    id: b.id,
    macro_plan_id: b.macro_plan_id,
    name: b.name,
    block_type: b.block_type,
    start_date: formatDateString(b.start_date),
    end_date: formatDateString(b.end_date),
    focus: b.focus,
    notes: b.notes,
    target_weekly_hours: b.target_weekly_hours,
    recovery_guidance: b.recovery_guidance,
    color: b.color,
    block_order: b.block_order,
  };
}

function serializePlan(p: DbMacroPlan, blocks?: DbTrainingBlock[]) {
  return {
    id: p.id,
    name: p.name,
    goal: p.goal,
    goal_objective_id: p.goal_objective_id,
    start_date: formatDateString(p.start_date),
    end_date: formatDateString(p.end_date),
    is_active: p.is_active,
    notes: p.notes,
    ...(blocks ? { blocks: blocks.map(serializeBlock) } : {}),
  };
}

export default async function handler(request: Request, _context: Context) {
  if (request.method === "OPTIONS") {
    return handleCorsPreFlight();
  }

  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const macroIdx = pathParts.lastIndexOf("macro-plans");
  const segs = macroIdx >= 0 ? pathParts.slice(macroIdx + 1) : [];

  // Route shapes (segments after "macro-plans"):
  //   []                    collection            GET list / POST create
  //   [planId]              a single plan         GET / PATCH / DELETE
  //   [planId, "blocks"]    blocks of a plan      POST add block
  //   ["blocks", blockId]   a single block        PATCH / DELETE
  const isBlockItem = segs.length === 2 && segs[0] === "blocks";
  const isPlanBlocks = segs.length === 2 && segs[1] === "blocks";
  const planIdSeg = isPlanBlocks
    ? parseInt(segs[0], 10)
    : segs.length === 1
      ? parseInt(segs[0], 10)
      : NaN;
  const blockId = isBlockItem ? parseInt(segs[1], 10) : NaN;

  // -------- Block-level: PATCH/DELETE /api/macro-plans/blocks/:blockId --------
  if (isBlockItem && (request.method === "PATCH" || request.method === "DELETE")) {
    return withAuth(request, async (req, _accessToken, newCookies) => {
      try {
        const { athleteId } = parseTokensFromCookies(req.headers.get("cookie"));
        if (!athleteId) return jsonResponse({ error: "No athlete ID" }, 400);
        if (isNaN(blockId)) {
          return jsonResponse({ error: "Invalid block ID" }, 400);
        }

        const existing = await getTrainingBlockById(blockId);
        if (!existing || Number(existing.athlete_id) !== athleteId) {
          return jsonResponse({ error: "Block not found" }, 404);
        }

        if (request.method === "DELETE") {
          await deleteTrainingBlockById(blockId);
          return jsonResponseWithCookies({ success: true }, newCookies);
        }

        const body = await req.json();
        const v = validateBlockBody(body, { requireAll: false });
        if (v.error) return jsonResponse({ error: v.error }, 400);

        const updated = await updateTrainingBlock(blockId, {
          name: v.name ?? existing.name,
          block_type: v.block_type ?? existing.block_type,
          start_date: v.start_date ?? formatDateString(existing.start_date)!,
          end_date: v.end_date ?? formatDateString(existing.end_date)!,
          focus: body.focus === undefined ? existing.focus : (v.focus ?? null),
          notes: existing.notes,
          target_weekly_hours: existing.target_weekly_hours,
          recovery_guidance: existing.recovery_guidance,
          color: body.color === undefined ? existing.color : (v.color ?? null),
          block_order:
            v.block_order === undefined ? existing.block_order : v.block_order,
        });

        return jsonResponseWithCookies(
          { success: true, block: serializeBlock(updated!) },
          newCookies,
        );
      } catch (error) {
        console.error("Block PATCH/DELETE error:", error);
        return jsonResponse({ error: "Failed to update block" }, 500);
      }
    });
  }

  // -------- Add block: POST /api/macro-plans/:id/blocks --------
  if (isPlanBlocks && request.method === "POST") {
    return withAuth(request, async (req, _accessToken, newCookies) => {
      try {
        const { athleteId } = parseTokensFromCookies(req.headers.get("cookie"));
        if (!athleteId) return jsonResponse({ error: "No athlete ID" }, 400);
        if (isNaN(planIdSeg)) {
          return jsonResponse({ error: "Invalid plan ID" }, 400);
        }

        const plan = await getMacroPlanById(planIdSeg);
        if (!plan || Number(plan.athlete_id) !== athleteId) {
          return jsonResponse({ error: "Macro plan not found" }, 404);
        }

        const body = await req.json();
        const v = validateBlockBody(body, { requireAll: true });
        if (v.error) return jsonResponse({ error: v.error }, 400);

        // Default block_order to append after existing blocks.
        let order = v.block_order;
        if (order === undefined) {
          const existingBlocks = await getTrainingBlocksForPlan(planIdSeg);
          order = existingBlocks.length;
        }

        const created = await createTrainingBlock({
          athlete_id: athleteId,
          macro_plan_id: planIdSeg,
          name: v.name!,
          block_type: v.block_type!,
          start_date: v.start_date!,
          end_date: v.end_date!,
          focus: v.focus ?? null,
          notes: null,
          target_weekly_hours: null,
          recovery_guidance: null,
          color: v.color ?? null,
          block_order: order,
        });

        return jsonResponseWithCookies(
          { success: true, block: serializeBlock(created) },
          newCookies,
        );
      } catch (error) {
        console.error("POST block error:", error);
        return jsonResponse({ error: "Failed to create block" }, 500);
      }
    });
  }

  // -------- Single plan: GET/PATCH/DELETE /api/macro-plans/:id --------
  if (segs.length === 1 && !isNaN(planIdSeg)) {
    if (request.method === "GET") {
      return withAuth(request, async (req, _accessToken, newCookies) => {
        try {
          const { athleteId } = parseTokensFromCookies(req.headers.get("cookie"));
          if (!athleteId) return jsonResponse({ error: "No athlete ID" }, 400);

          const plan = await getMacroPlanById(planIdSeg);
          if (!plan || Number(plan.athlete_id) !== athleteId) {
            return jsonResponse({ error: "Macro plan not found" }, 404);
          }
          const blocks = await getTrainingBlocksForPlan(planIdSeg);
          return jsonResponseWithCookies(
            { plan: serializePlan(plan, blocks) },
            newCookies,
          );
        } catch (error) {
          console.error("GET macro plan error:", error);
          return jsonResponse({ error: "Failed to fetch macro plan" }, 500);
        }
      });
    }

    if (request.method === "PATCH") {
      return withAuth(request, async (req, _accessToken, newCookies) => {
        try {
          const { athleteId } = parseTokensFromCookies(req.headers.get("cookie"));
          if (!athleteId) return jsonResponse({ error: "No athlete ID" }, 400);

          const existing = await getMacroPlanById(planIdSeg);
          if (!existing || Number(existing.athlete_id) !== athleteId) {
            return jsonResponse({ error: "Macro plan not found" }, 404);
          }

          const body = await req.json();
          const v = await validatePlanBody(body, athleteId, { requireAll: false });
          if (v.error) return jsonResponse({ error: v.error }, 400);

          const nextActive =
            v.is_active === undefined ? existing.is_active : v.is_active;
          const updated = await updateMacroPlan(planIdSeg, {
            name: v.name ?? existing.name,
            goal: body.goal === undefined ? existing.goal : (v.goal ?? null),
            goal_objective_id:
              body.goal_objective_id === undefined
                ? existing.goal_objective_id
                : (v.goal_objective_id ?? null),
            start_date: v.start_date ?? formatDateString(existing.start_date)!,
            end_date: v.end_date ?? formatDateString(existing.end_date)!,
            is_active: nextActive,
            notes: body.notes === undefined ? existing.notes : (v.notes ?? null),
          });

          if (nextActive) {
            await deactivateOtherMacroPlans(athleteId, planIdSeg);
          }

          return jsonResponseWithCookies(
            { success: true, plan: serializePlan(updated!) },
            newCookies,
          );
        } catch (error) {
          console.error("PATCH macro plan error:", error);
          return jsonResponse({ error: "Failed to update macro plan" }, 500);
        }
      });
    }

    if (request.method === "DELETE") {
      return withAuth(request, async (req, _accessToken, newCookies) => {
        try {
          const { athleteId } = parseTokensFromCookies(req.headers.get("cookie"));
          if (!athleteId) return jsonResponse({ error: "No athlete ID" }, 400);

          const existing = await getMacroPlanById(planIdSeg);
          if (!existing || Number(existing.athlete_id) !== athleteId) {
            return jsonResponse({ error: "Macro plan not found" }, 404);
          }
          await deleteMacroPlanById(planIdSeg);
          return jsonResponseWithCookies({ success: true }, newCookies);
        } catch (error) {
          console.error("DELETE macro plan error:", error);
          return jsonResponse({ error: "Failed to delete macro plan" }, 500);
        }
      });
    }
  }

  // -------- Collection: GET list (?active=1) / POST create --------
  if (segs.length === 0 && request.method === "GET") {
    return withAuth(request, async (req, _accessToken, newCookies) => {
      try {
        const { athleteId } = parseTokensFromCookies(req.headers.get("cookie"));
        if (!athleteId) return jsonResponse({ error: "No athlete ID" }, 400);

        // ?active=1 -> the active plan plus its blocks (planning context).
        if (url.searchParams.get("active") === "1") {
          const plan = await getActiveMacroPlan(athleteId);
          if (!plan) {
            return jsonResponseWithCookies({ plan: null }, newCookies);
          }
          const blocks = await getTrainingBlocksForPlan(plan.id);
          return jsonResponseWithCookies(
            { plan: serializePlan(plan, blocks) },
            newCookies,
          );
        }

        const plans = await getMacroPlans(athleteId);
        return jsonResponseWithCookies(
          { plans: plans.map((p) => serializePlan(p)) },
          newCookies,
        );
      } catch (error) {
        console.error("GET macro plans error:", error);
        return jsonResponse({ error: "Failed to fetch macro plans" }, 500);
      }
    });
  }

  if (segs.length === 0 && request.method === "POST") {
    return withAuth(request, async (req, _accessToken, newCookies) => {
      try {
        const { athleteId } = parseTokensFromCookies(req.headers.get("cookie"));
        if (!athleteId) return jsonResponse({ error: "No athlete ID" }, 400);

        const body = await req.json();
        const v = await validatePlanBody(body, athleteId, { requireAll: true });
        if (v.error) return jsonResponse({ error: v.error }, 400);

        const isActive = v.is_active ?? true;
        const created = await createMacroPlan({
          athlete_id: athleteId,
          name: v.name!,
          goal: v.goal ?? null,
          goal_objective_id: v.goal_objective_id ?? null,
          start_date: v.start_date!,
          end_date: v.end_date!,
          is_active: isActive,
          notes: v.notes ?? null,
        });

        if (isActive) {
          await deactivateOtherMacroPlans(athleteId, created.id);
        }

        return jsonResponseWithCookies(
          { success: true, plan: serializePlan(created) },
          newCookies,
        );
      } catch (error) {
        console.error("POST macro plan error:", error);
        return jsonResponse({ error: "Failed to create macro plan" }, 500);
      }
    });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
}

// --- validation helpers ---

async function validatePlanBody(
  body: Record<string, unknown>,
  athleteId: number,
  opts: { requireAll: boolean },
): Promise<{
  error?: string;
  name?: string;
  goal?: string | null;
  goal_objective_id?: number | null;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
  notes?: string | null;
}> {
  const out: Awaited<ReturnType<typeof validatePlanBody>> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return { error: "name must be a non-empty string" };
    }
    out.name = body.name.trim();
  } else if (opts.requireAll) {
    return { error: "name is required" };
  }

  if (body.start_date !== undefined) {
    if (typeof body.start_date !== "string" || !DATE_RE.test(body.start_date)) {
      return { error: "start_date must be YYYY-MM-DD" };
    }
    out.start_date = body.start_date;
  } else if (opts.requireAll) {
    return { error: "start_date is required" };
  }

  if (body.end_date !== undefined) {
    if (typeof body.end_date !== "string" || !DATE_RE.test(body.end_date)) {
      return { error: "end_date must be YYYY-MM-DD" };
    }
    out.end_date = body.end_date;
  } else if (opts.requireAll) {
    return { error: "end_date is required" };
  }

  if (out.start_date && out.end_date && out.end_date < out.start_date) {
    return { error: "end_date must be on or after start_date" };
  }

  if (body.goal !== undefined) {
    if (body.goal !== null && typeof body.goal !== "string") {
      return { error: "goal must be a string or null" };
    }
    out.goal = (body.goal as string | null) ?? null;
  }

  if (body.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return { error: "notes must be a string or null" };
    }
    out.notes = (body.notes as string | null) ?? null;
  }

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") {
      return { error: "is_active must be a boolean" };
    }
    out.is_active = body.is_active;
  }

  if (body.goal_objective_id !== undefined && body.goal_objective_id !== null) {
    const objId = Number(body.goal_objective_id);
    if (!Number.isInteger(objId)) {
      return { error: "goal_objective_id must be an integer" };
    }
    const obj = await getObjectiveById(objId);
    if (!obj || Number(obj.athlete_id) !== athleteId) {
      return { error: "goal_objective_id does not reference your objective" };
    }
    out.goal_objective_id = objId;
  } else if (body.goal_objective_id === null) {
    out.goal_objective_id = null;
  }

  return out;
}

function validateBlockBody(
  body: Record<string, unknown>,
  opts: { requireAll: boolean },
): {
  error?: string;
  name?: string;
  block_type?: string;
  start_date?: string;
  end_date?: string;
  focus?: string | null;
  color?: string | null;
  block_order?: number;
} {
  const out: ReturnType<typeof validateBlockBody> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return { error: "name must be a non-empty string" };
    }
    out.name = body.name.trim();
  } else if (opts.requireAll) {
    return { error: "name is required" };
  }

  if (body.block_type !== undefined) {
    if (
      typeof body.block_type !== "string" ||
      !BLOCK_TYPES.includes(body.block_type)
    ) {
      return { error: `block_type must be one of: ${BLOCK_TYPES.join(", ")}` };
    }
    out.block_type = body.block_type;
  } else if (opts.requireAll) {
    return { error: "block_type is required" };
  }

  if (body.start_date !== undefined) {
    if (typeof body.start_date !== "string" || !DATE_RE.test(body.start_date)) {
      return { error: "start_date must be YYYY-MM-DD" };
    }
    out.start_date = body.start_date;
  } else if (opts.requireAll) {
    return { error: "start_date is required" };
  }

  if (body.end_date !== undefined) {
    if (typeof body.end_date !== "string" || !DATE_RE.test(body.end_date)) {
      return { error: "end_date must be YYYY-MM-DD" };
    }
    out.end_date = body.end_date;
  } else if (opts.requireAll) {
    return { error: "end_date is required" };
  }

  if (out.start_date && out.end_date && out.end_date < out.start_date) {
    return { error: "end_date must be on or after start_date" };
  }

  if (body.focus !== undefined) {
    if (body.focus !== null && typeof body.focus !== "string") {
      return { error: "focus must be a string or null" };
    }
    out.focus = (body.focus as string | null) ?? null;
  }

  if (body.color !== undefined) {
    if (body.color !== null && typeof body.color !== "string") {
      return { error: "color must be a string or null" };
    }
    out.color = (body.color as string | null) ?? null;
  }

  if (body.block_order !== undefined && body.block_order !== null) {
    const ord = Number(body.block_order);
    if (!Number.isInteger(ord) || ord < 0) {
      return { error: "block_order must be a non-negative integer" };
    }
    out.block_order = ord;
  }

  return out;
}
