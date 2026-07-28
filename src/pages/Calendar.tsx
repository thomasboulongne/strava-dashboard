import { useMemo, useState } from "react";
import {
  Container,
  Flex,
  Text,
  Box,
  Button,
  Heading,
  Badge,
  Dialog,
  TextField,
  TextArea,
  Select,
  Skeleton,
  Callout,
} from "@radix-ui/themes";
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiFlag,
  FiInfo,
  FiCalendar,
} from "react-icons/fi";
import {
  useObjectives,
  useCreateObjective,
  useUpdateObjective,
  useDeleteObjective,
  useActiveMacroPlan,
  useMacroPlans,
  useCreateMacroPlan,
  useUpdateMacroPlan,
  useDeleteMacroPlan,
  useCreateTrainingBlock,
  useUpdateTrainingBlock,
  useDeleteTrainingBlock,
} from "../hooks/useObjectives";
import { parseLocalDate, formatLocalDate } from "../hooks/useTrainingPlan";
import type {
  Objective,
  ObjectiveType,
  ObjectivePriority,
  MacroPlan,
  TrainingBlock,
  BlockType,
} from "../lib/strava-types";
import styles from "./Calendar.module.css";

const OBJECTIVE_TYPES: ObjectiveType[] = [
  "race",
  "test",
  "milestone",
  "camp",
  "note",
];
const PRIORITIES: ObjectivePriority[] = ["A", "B", "C"];
const BLOCK_TYPES: BlockType[] = [
  "base",
  "build",
  "peak",
  "taper",
  "recovery",
  "race",
];

// Default color per block type (used when a block has no explicit color).
const BLOCK_COLORS: Record<BlockType, string> = {
  base: "var(--blue-9)",
  build: "var(--orange-9)",
  peak: "var(--red-9)",
  taper: "var(--purple-9)",
  recovery: "var(--green-9)",
  race: "var(--amber-9)",
};

const OBJECTIVE_COLORS: Record<ObjectiveType, string> = {
  race: "red",
  test: "blue",
  milestone: "green",
  camp: "purple",
  note: "gray",
};

// --- date helpers ---
const MS_DAY = 86400000;
function daysBetween(a: string, b: string): number {
  return Math.round(
    (parseLocalDate(b).getTime() - parseLocalDate(a).getTime()) / MS_DAY,
  );
}
function todayStr(): string {
  return formatLocalDate(new Date());
}
function fmtHuman(date: string): string {
  return parseLocalDate(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function fmtRange(start: string, end: string | null): string {
  if (!end || end === start) return fmtHuman(start);
  return `${fmtHuman(start)} – ${fmtHuman(end)}`;
}

export function Calendar() {
  const objectivesQuery = useObjectives();
  const activePlanQuery = useActiveMacroPlan();
  const plansQuery = useMacroPlans();

  const objectives = objectivesQuery.data?.objectives ?? [];
  const activePlan = activePlanQuery.data?.plan ?? null;

  const [objectiveDialog, setObjectiveDialog] = useState<{
    open: boolean;
    editing: Objective | null;
  }>({ open: false, editing: null });
  const [planDialog, setPlanDialog] = useState<{
    open: boolean;
    editing: MacroPlan | null;
  }>({ open: false, editing: null });
  const [blockDialog, setBlockDialog] = useState<{
    open: boolean;
    editing: TrainingBlock | null;
  }>({ open: false, editing: null });

  const isLoading =
    objectivesQuery.isLoading || activePlanQuery.isLoading;

  return (
    <Container size="4" className={styles.container}>
      <Flex direction="column" gap="5" py="6">
        <Flex justify="between" align="center" wrap="wrap" gap="3">
          <Flex align="center" gap="2">
            <FiCalendar size={22} />
            <Heading size="6">Calendar</Heading>
          </Flex>
          <Flex gap="2" wrap="wrap">
            <Button
              variant="soft"
              onClick={() =>
                setObjectiveDialog({ open: true, editing: null })
              }
            >
              <FiFlag /> New objective
            </Button>
            <Button
              onClick={() => setPlanDialog({ open: true, editing: null })}
            >
              <FiPlus /> New plan
            </Button>
          </Flex>
        </Flex>

        {isLoading ? (
          <Skeleton height="240px" />
        ) : (
          <>
            <MacroPlanSection
              plan={activePlan}
              plans={plansQuery.data?.plans ?? []}
              objectives={objectives}
              onEditPlan={(p) => setPlanDialog({ open: true, editing: p })}
              onNewPlan={() => setPlanDialog({ open: true, editing: null })}
              onAddBlock={() => setBlockDialog({ open: true, editing: null })}
              onEditBlock={(b) =>
                setBlockDialog({ open: true, editing: b })
              }
            />

            <ObjectivesSection
              objectives={objectives}
              onEdit={(o) => setObjectiveDialog({ open: true, editing: o })}
            />
          </>
        )}
      </Flex>

      <ObjectiveDialog
        state={objectiveDialog}
        onClose={() => setObjectiveDialog({ open: false, editing: null })}
      />
      <PlanDialog
        state={planDialog}
        objectives={objectives}
        onClose={() => setPlanDialog({ open: false, editing: null })}
      />
      <BlockDialog
        state={blockDialog}
        plan={activePlan}
        onClose={() => setBlockDialog({ open: false, editing: null })}
      />
    </Container>
  );
}

// ------------------------- Macro plan + timeline -------------------------

function MacroPlanSection({
  plan,
  plans,
  objectives,
  onEditPlan,
  onNewPlan,
  onAddBlock,
  onEditBlock,
}: {
  plan: MacroPlan | null;
  plans: MacroPlan[];
  objectives: Objective[];
  onEditPlan: (p: MacroPlan) => void;
  onNewPlan: () => void;
  onAddBlock: () => void;
  onEditBlock: (b: TrainingBlock) => void;
}) {
  const updatePlan = useUpdateMacroPlan();
  const deletePlan = useDeleteMacroPlan();

  if (!plan) {
    return (
      <Box className={styles.card}>
        <Flex direction="column" align="center" gap="3" py="6">
          <Text color="gray">No active macro plan yet.</Text>
          <Button onClick={onNewPlan}>
            <FiPlus /> Create your first plan
          </Button>
          {plans.length > 0 && (
            <Text size="1" color="gray">
              You have {plans.length} inactive plan(s). Open one to make it
              active.
            </Text>
          )}
        </Flex>
      </Box>
    );
  }

  return (
    <Box className={styles.card}>
      <Flex justify="between" align="start" gap="3" wrap="wrap" mb="3">
        <Box>
          <Flex align="center" gap="2">
            <Heading size="4">{plan.name}</Heading>
            <Badge color="green" variant="soft">
              Active
            </Badge>
          </Flex>
          <Text size="2" color="gray">
            {fmtRange(plan.start_date, plan.end_date)}
          </Text>
          {plan.goal && (
            <Text as="p" size="2" mt="1">
              Goal: {plan.goal}
            </Text>
          )}
        </Box>
        <Flex gap="2">
          <Button variant="soft" onClick={onAddBlock}>
            <FiPlus /> Block
          </Button>
          <Button variant="soft" color="gray" onClick={() => onEditPlan(plan)}>
            <FiEdit2 /> Edit
          </Button>
          <Button
            variant="soft"
            color="red"
            onClick={() => {
              if (
                window.confirm(
                  `Delete plan "${plan.name}" and all its blocks?`,
                )
              ) {
                deletePlan.mutate(plan.id);
              }
            }}
          >
            <FiTrash2 />
          </Button>
        </Flex>
      </Flex>

      <Timeline
        plan={plan}
        objectives={objectives}
        onEditBlock={onEditBlock}
      />

      {plans.length > 1 && (
        <Flex gap="2" mt="3" wrap="wrap" align="center">
          <Text size="1" color="gray">
            Other plans:
          </Text>
          {plans
            .filter((p) => p.id !== plan.id)
            .map((p) => (
              <Button
                key={p.id}
                size="1"
                variant="outline"
                onClick={() =>
                  updatePlan.mutate({ id: p.id, updates: { is_active: true } })
                }
              >
                {p.name}
              </Button>
            ))}
        </Flex>
      )}
    </Box>
  );
}

function Timeline({
  plan,
  objectives,
  onEditBlock,
}: {
  plan: MacroPlan;
  objectives: Objective[];
  onEditBlock: (b: TrainingBlock) => void;
}) {
  const blocks = plan.blocks ?? [];
  const start = plan.start_date;
  const end = plan.end_date;
  const totalDays = Math.max(1, daysBetween(start, end) + 1);

  // Month tick marks across the plan span.
  const months = useMemo(() => {
    const out: { label: string; leftPct: number }[] = [];
    const s = parseLocalDate(start);
    const e = parseLocalDate(end);
    const cur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cur <= e) {
      const offset = daysBetween(start, formatLocalDate(cur));
      out.push({
        label: cur.toLocaleDateString("en-US", { month: "short" }),
        leftPct: Math.max(0, (offset / totalDays) * 100),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  }, [start, end, totalDays]);

  // Objectives that fall within the plan span.
  const inRange = objectives.filter(
    (o) => o.start_date <= end && (o.end_date ?? o.start_date) >= start,
  );

  const today = todayStr();
  const todayInRange = today >= start && today <= end;
  const todayPct = todayInRange
    ? (daysBetween(start, today) / totalDays) * 100
    : null;

  const widthPx = Math.max(640, months.length * 130);

  return (
    <Box className={styles.timelineScroll}>
      <Box className={styles.timeline} style={{ minWidth: `${widthPx}px` }}>
        {/* Month labels */}
        <Box className={styles.monthRow}>
          {months.map((m, i) => (
            <Box
              key={i}
              className={styles.monthTick}
              style={{ left: `${m.leftPct}%` }}
            >
              <span>{m.label}</span>
            </Box>
          ))}
        </Box>

        {/* Objectives lane */}
        <Box className={styles.objectiveLane}>
          {todayPct !== null && (
            <Box className={styles.todayLine} style={{ left: `${todayPct}%` }} />
          )}
          {inRange.map((o) => {
            const clampedStart = o.start_date < start ? start : o.start_date;
            const left = (daysBetween(start, clampedStart) / totalDays) * 100;
            return (
              <Box
                key={o.id}
                className={styles.objectivePin}
                style={{ left: `${left}%` }}
                title={`${o.title} — ${fmtRange(o.start_date, o.end_date)}`}
              >
                <span
                  className={styles.pinDot}
                  data-priority={o.priority ?? ""}
                />
                <span className={styles.pinLabel}>
                  {o.priority ? `${o.priority}· ` : ""}
                  {o.title}
                </span>
              </Box>
            );
          })}
        </Box>

        {/* Blocks lane */}
        <Box className={styles.blockLane}>
          {todayPct !== null && (
            <Box className={styles.todayLine} style={{ left: `${todayPct}%` }} />
          )}
          {blocks.length === 0 ? (
            <Text size="1" color="gray" className={styles.emptyBlocks}>
              No training blocks yet — add one to lay out your periodization.
            </Text>
          ) : (
            blocks.map((b) => {
              const bStart = b.start_date < start ? start : b.start_date;
              const bEnd = b.end_date > end ? end : b.end_date;
              const left = (daysBetween(start, bStart) / totalDays) * 100;
              const width =
                ((daysBetween(bStart, bEnd) + 1) / totalDays) * 100;
              const color = b.color || BLOCK_COLORS[b.block_type];
              return (
                <button
                  key={b.id}
                  className={styles.block}
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 2)}%`,
                    background: color,
                  }}
                  onClick={() => onEditBlock(b)}
                  title={`${b.name} (${b.block_type}) — ${fmtRange(
                    b.start_date,
                    b.end_date,
                  )}`}
                >
                  <span className={styles.blockName}>{b.name}</span>
                </button>
              );
            })
          )}
        </Box>
      </Box>
    </Box>
  );
}

// ------------------------- Objectives list -------------------------

function ObjectivesSection({
  objectives,
  onEdit,
}: {
  objectives: Objective[];
  onEdit: (o: Objective) => void;
}) {
  const deleteObjective = useDeleteObjective();
  const today = todayStr();
  const upcoming = objectives.filter((o) => (o.end_date ?? o.start_date) >= today);
  const past = objectives.filter((o) => (o.end_date ?? o.start_date) < today);

  return (
    <Box>
      <Heading size="4" mb="3">
        Objectives
      </Heading>
      {objectives.length === 0 ? (
        <Callout.Root color="gray">
          <Callout.Icon>
            <FiInfo />
          </Callout.Icon>
          <Callout.Text>
            No objectives yet. Add your races, tests, and milestones so your
            AI agent can plan toward them.
          </Callout.Text>
        </Callout.Root>
      ) : (
        <Flex direction="column" gap="4">
          {upcoming.length > 0 && (
            <ObjectiveGroup
              title="Upcoming"
              items={upcoming}
              onEdit={onEdit}
              onDelete={(id) => deleteObjective.mutate(id)}
            />
          )}
          {past.length > 0 && (
            <ObjectiveGroup
              title="Past"
              items={past}
              onEdit={onEdit}
              onDelete={(id) => deleteObjective.mutate(id)}
              muted
            />
          )}
        </Flex>
      )}
    </Box>
  );
}

function ObjectiveGroup({
  title,
  items,
  onEdit,
  onDelete,
  muted,
}: {
  title: string;
  items: Objective[];
  onEdit: (o: Objective) => void;
  onDelete: (id: number) => void;
  muted?: boolean;
}) {
  return (
    <Box>
      <Text size="1" color="gray" weight="bold">
        {title}
      </Text>
      <Flex direction="column" gap="2" mt="2">
        {items.map((o) => (
          <Flex
            key={o.id}
            className={styles.objectiveRow}
            justify="between"
            align="center"
            gap="3"
            style={{ opacity: muted ? 0.7 : 1 }}
          >
            <Flex align="center" gap="3" wrap="wrap">
              <Badge color={OBJECTIVE_COLORS[o.objective_type] as never}>
                {o.objective_type}
              </Badge>
              {o.priority && (
                <Badge variant="solid" color="red">
                  {o.priority}
                </Badge>
              )}
              <Box>
                <Text weight="medium">{o.title}</Text>
                <Text as="p" size="1" color="gray">
                  {fmtRange(o.start_date, o.end_date)}
                  {o.notes ? ` · ${o.notes}` : ""}
                </Text>
              </Box>
            </Flex>
            <Flex gap="1">
              <Button
                size="1"
                variant="ghost"
                color="gray"
                onClick={() => onEdit(o)}
              >
                <FiEdit2 />
              </Button>
              <Button
                size="1"
                variant="ghost"
                color="red"
                onClick={() => {
                  if (window.confirm(`Delete objective "${o.title}"?`)) {
                    onDelete(o.id);
                  }
                }}
              >
                <FiTrash2 />
              </Button>
            </Flex>
          </Flex>
        ))}
      </Flex>
    </Box>
  );
}

// ------------------------- Dialogs -------------------------

function ObjectiveDialog({
  state,
  onClose,
}: {
  state: { open: boolean; editing: Objective | null };
  onClose: () => void;
}) {
  const create = useCreateObjective();
  const update = useUpdateObjective();
  const editing = state.editing;

  const [form, setForm] = useState(() => blankObjective());
  // Reset the form whenever the dialog target changes.
  const [lastKey, setLastKey] = useState<string>("");
  const key = `${state.open}-${editing?.id ?? "new"}`;
  if (key !== lastKey && state.open) {
    setLastKey(key);
    setForm(
      editing
        ? {
            title: editing.title,
            objective_type: editing.objective_type,
            priority: editing.priority ?? "",
            start_date: editing.start_date,
            end_date: editing.end_date ?? "",
            notes: editing.notes ?? "",
          }
        : blankObjective(),
    );
  }

  const canSave = form.title.trim() !== "" && form.start_date !== "";
  const pending = create.isPending || update.isPending;

  const handleSave = async () => {
    const payload = {
      title: form.title.trim(),
      objective_type: form.objective_type,
      start_date: form.start_date,
      end_date: form.end_date || null,
      priority: (form.priority || null) as ObjectivePriority | null,
      notes: form.notes.trim() || null,
    };
    if (editing) {
      await update.mutateAsync({ id: editing.id, updates: payload });
    } else {
      await create.mutateAsync(payload);
    }
    onClose();
  };

  return (
    <Dialog.Root open={state.open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content maxWidth="480px">
        <Dialog.Title>
          {editing ? "Edit objective" : "New objective"}
        </Dialog.Title>
        <Flex direction="column" gap="3" mt="2">
          <label>
            <Text size="1" color="gray">
              Title
            </Text>
            <TextField.Root
              value={form.title}
              placeholder="e.g. Paris Marathon"
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <Flex gap="3">
            <label style={{ flex: 1 }}>
              <Text size="1" color="gray">
                Type
              </Text>
              <Select.Root
                value={form.objective_type}
                onValueChange={(v) =>
                  setForm({ ...form, objective_type: v as ObjectiveType })
                }
              >
                <Select.Trigger style={{ width: "100%" }} />
                <Select.Content>
                  {OBJECTIVE_TYPES.map((t) => (
                    <Select.Item key={t} value={t}>
                      {t}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </label>
            <label style={{ flex: 1 }}>
              <Text size="1" color="gray">
                Priority
              </Text>
              <Select.Root
                value={form.priority || "none"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    priority: v === "none" ? "" : (v as ObjectivePriority),
                  })
                }
              >
                <Select.Trigger style={{ width: "100%" }} />
                <Select.Content>
                  <Select.Item value="none">—</Select.Item>
                  {PRIORITIES.map((p) => (
                    <Select.Item key={p} value={p}>
                      {p}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </label>
          </Flex>
          <Flex gap="3">
            <label style={{ flex: 1 }}>
              <Text size="1" color="gray">
                Start date
              </Text>
              <TextField.Root
                type="date"
                value={form.start_date}
                onChange={(e) =>
                  setForm({ ...form, start_date: e.target.value })
                }
              />
            </label>
            <label style={{ flex: 1 }}>
              <Text size="1" color="gray">
                End date (optional)
              </Text>
              <TextField.Root
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </label>
          </Flex>
          <label>
            <Text size="1" color="gray">
              Notes
            </Text>
            <TextArea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <Flex gap="3" justify="end" mt="2">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button disabled={!canSave || pending} onClick={handleSave}>
              {editing ? "Save" : "Create"}
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function PlanDialog({
  state,
  objectives,
  onClose,
}: {
  state: { open: boolean; editing: MacroPlan | null };
  objectives: Objective[];
  onClose: () => void;
}) {
  const create = useCreateMacroPlan();
  const update = useUpdateMacroPlan();
  const editing = state.editing;

  const [form, setForm] = useState(() => blankPlan());
  const [lastKey, setLastKey] = useState<string>("");
  const key = `${state.open}-${editing?.id ?? "new"}`;
  if (key !== lastKey && state.open) {
    setLastKey(key);
    setForm(
      editing
        ? {
            name: editing.name,
            goal: editing.goal ?? "",
            goal_objective_id: editing.goal_objective_id
              ? String(editing.goal_objective_id)
              : "",
            start_date: editing.start_date,
            end_date: editing.end_date,
            is_active: editing.is_active,
            notes: editing.notes ?? "",
          }
        : blankPlan(),
    );
  }

  const canSave =
    form.name.trim() !== "" && form.start_date !== "" && form.end_date !== "";
  const pending = create.isPending || update.isPending;

  const handleSave = async () => {
    const payload = {
      name: form.name.trim(),
      goal: form.goal.trim() || null,
      goal_objective_id: form.goal_objective_id
        ? Number(form.goal_objective_id)
        : null,
      start_date: form.start_date,
      end_date: form.end_date,
      is_active: form.is_active,
      notes: form.notes.trim() || null,
    };
    if (editing) {
      await update.mutateAsync({ id: editing.id, updates: payload });
    } else {
      await create.mutateAsync(payload);
    }
    onClose();
  };

  return (
    <Dialog.Root open={state.open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content maxWidth="480px">
        <Dialog.Title>{editing ? "Edit plan" : "New macro plan"}</Dialog.Title>
        <Flex direction="column" gap="3" mt="2">
          <label>
            <Text size="1" color="gray">
              Name
            </Text>
            <TextField.Root
              value={form.name}
              placeholder="e.g. 2026 Marathon build"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            <Text size="1" color="gray">
              Goal
            </Text>
            <TextField.Root
              value={form.goal}
              placeholder="Season goal"
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
            />
          </label>
          <Flex gap="3">
            <label style={{ flex: 1 }}>
              <Text size="1" color="gray">
                Start date
              </Text>
              <TextField.Root
                type="date"
                value={form.start_date}
                onChange={(e) =>
                  setForm({ ...form, start_date: e.target.value })
                }
              />
            </label>
            <label style={{ flex: 1 }}>
              <Text size="1" color="gray">
                End date
              </Text>
              <TextField.Root
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </label>
          </Flex>
          <label>
            <Text size="1" color="gray">
              Goal objective (A-race)
            </Text>
            <Select.Root
              value={form.goal_objective_id || "none"}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  goal_objective_id: v === "none" ? "" : v,
                })
              }
            >
              <Select.Trigger style={{ width: "100%" }} />
              <Select.Content>
                <Select.Item value="none">—</Select.Item>
                {objectives.map((o) => (
                  <Select.Item key={o.id} value={String(o.id)}>
                    {o.title} ({fmtHuman(o.start_date)})
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </label>
          <label>
            <Flex align="center" gap="2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm({ ...form, is_active: e.target.checked })
                }
              />
              <Text size="2">Active plan (the one you're following)</Text>
            </Flex>
          </label>
          <Flex gap="3" justify="end" mt="2">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button disabled={!canSave || pending} onClick={handleSave}>
              {editing ? "Save" : "Create"}
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function BlockDialog({
  state,
  plan,
  onClose,
}: {
  state: { open: boolean; editing: TrainingBlock | null };
  plan: MacroPlan | null;
  onClose: () => void;
}) {
  const create = useCreateTrainingBlock();
  const update = useUpdateTrainingBlock();
  const del = useDeleteTrainingBlock();
  const editing = state.editing;

  const [form, setForm] = useState(() => blankBlock());
  const [lastKey, setLastKey] = useState<string>("");
  const key = `${state.open}-${editing?.id ?? "new"}`;
  if (key !== lastKey && state.open) {
    setLastKey(key);
    setForm(
      editing
        ? {
            name: editing.name,
            block_type: editing.block_type,
            start_date: editing.start_date,
            end_date: editing.end_date,
            focus: editing.focus ?? "",
          }
        : {
            ...blankBlock(),
            start_date: plan?.start_date ?? "",
            end_date: plan?.start_date ?? "",
          },
    );
  }

  const canSave =
    form.name.trim() !== "" && form.start_date !== "" && form.end_date !== "";
  const pending = create.isPending || update.isPending;

  const handleSave = async () => {
    const payload = {
      name: form.name.trim(),
      block_type: form.block_type,
      start_date: form.start_date,
      end_date: form.end_date,
      focus: form.focus.trim() || null,
    };
    if (editing) {
      await update.mutateAsync({ blockId: editing.id, updates: payload });
    } else if (plan) {
      await create.mutateAsync({ planId: plan.id, block: payload });
    }
    onClose();
  };

  return (
    <Dialog.Root open={state.open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content maxWidth="480px">
        <Dialog.Title>
          {editing ? "Edit block" : "New training block"}
        </Dialog.Title>
        <Flex direction="column" gap="3" mt="2">
          <Flex gap="3">
            <label style={{ flex: 2 }}>
              <Text size="1" color="gray">
                Name
              </Text>
              <TextField.Root
                value={form.name}
                placeholder="e.g. Base 1"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label style={{ flex: 1 }}>
              <Text size="1" color="gray">
                Type
              </Text>
              <Select.Root
                value={form.block_type}
                onValueChange={(v) =>
                  setForm({ ...form, block_type: v as BlockType })
                }
              >
                <Select.Trigger style={{ width: "100%" }} />
                <Select.Content>
                  {BLOCK_TYPES.map((t) => (
                    <Select.Item key={t} value={t}>
                      {t}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </label>
          </Flex>
          <Flex gap="3">
            <label style={{ flex: 1 }}>
              <Text size="1" color="gray">
                Start date
              </Text>
              <TextField.Root
                type="date"
                value={form.start_date}
                onChange={(e) =>
                  setForm({ ...form, start_date: e.target.value })
                }
              />
            </label>
            <label style={{ flex: 1 }}>
              <Text size="1" color="gray">
                End date
              </Text>
              <TextField.Root
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </label>
          </Flex>
          <label>
            <Text size="1" color="gray">
              Focus
            </Text>
            <TextArea
              value={form.focus}
              placeholder="What to emphasize this block"
              onChange={(e) => setForm({ ...form, focus: e.target.value })}
            />
          </label>
          <Flex gap="3" justify="between" mt="2">
            {editing ? (
              <Button
                variant="soft"
                color="red"
                onClick={() => {
                  if (window.confirm(`Delete block "${editing.name}"?`)) {
                    del.mutate(editing.id);
                    onClose();
                  }
                }}
              >
                <FiTrash2 /> Delete
              </Button>
            ) : (
              <span />
            )}
            <Flex gap="3">
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button disabled={!canSave || pending} onClick={handleSave}>
                {editing ? "Save" : "Create"}
              </Button>
            </Flex>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

// --- blank form factories ---
function blankObjective() {
  return {
    title: "",
    objective_type: "race" as ObjectiveType,
    priority: "" as ObjectivePriority | "",
    start_date: todayStr(),
    end_date: "",
    notes: "",
  };
}
function blankPlan() {
  return {
    name: "",
    goal: "",
    goal_objective_id: "",
    start_date: todayStr(),
    end_date: "",
    is_active: true,
    notes: "",
  };
}
function blankBlock() {
  return {
    name: "",
    block_type: "base" as BlockType,
    start_date: "",
    end_date: "",
    focus: "",
  };
}
