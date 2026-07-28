import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getObjectives,
  createObjective,
  updateObjective,
  deleteObjective,
  getMacroPlans,
  getActiveMacroPlan,
  createMacroPlan,
  updateMacroPlan,
  deleteMacroPlan,
  createTrainingBlock,
  updateTrainingBlock,
  deleteTrainingBlock,
} from "../lib/api";
import type {
  ObjectivesResponse,
  MacroPlansResponse,
  MacroPlanResponse,
  ObjectiveType,
  ObjectivePriority,
  BlockType,
} from "../lib/strava-types";

// Cache time: 30 seconds (matches useTrainingPlan)
const STALE_TIME = 1000 * 30;

// ----------------------------- Objectives -----------------------------

export function useObjectives(from?: string, to?: string) {
  return useQuery<ObjectivesResponse>({
    queryKey: ["objectives", from ?? null, to ?? null],
    queryFn: () => getObjectives(from, to),
    staleTime: STALE_TIME,
  });
}

export function useCreateObjective() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (objective: {
      title: string;
      objective_type: ObjectiveType;
      start_date: string;
      end_date?: string | null;
      priority?: ObjectivePriority | null;
      notes?: string | null;
    }) => createObjective(objective),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["objectives"] });
      queryClient.invalidateQueries({ queryKey: ["macroPlans"] });
    },
  });
}

export function useUpdateObjective() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: number;
      updates: Partial<{
        title: string;
        objective_type: ObjectiveType;
        start_date: string;
        end_date: string | null;
        priority: ObjectivePriority | null;
        notes: string | null;
      }>;
    }) => updateObjective(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["objectives"] });
    },
  });
}

export function useDeleteObjective() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteObjective(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["objectives"] });
      queryClient.invalidateQueries({ queryKey: ["macroPlans"] });
    },
  });
}

// ----------------------------- Macro plans -----------------------------

export function useMacroPlans() {
  return useQuery<MacroPlansResponse>({
    queryKey: ["macroPlans"],
    queryFn: () => getMacroPlans(),
    staleTime: STALE_TIME,
  });
}

export function useActiveMacroPlan() {
  return useQuery<MacroPlanResponse>({
    queryKey: ["macroPlan", "active"],
    queryFn: () => getActiveMacroPlan(),
    staleTime: STALE_TIME,
  });
}

function invalidatePlans(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["macroPlans"] });
  queryClient.invalidateQueries({ queryKey: ["macroPlan"] });
}

export function useCreateMacroPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (plan: {
      name: string;
      start_date: string;
      end_date: string;
      goal?: string | null;
      goal_objective_id?: number | null;
      is_active?: boolean;
      notes?: string | null;
    }) => createMacroPlan(plan),
    onSuccess: () => invalidatePlans(queryClient),
  });
}

export function useUpdateMacroPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: number;
      updates: Partial<{
        name: string;
        start_date: string;
        end_date: string;
        goal: string | null;
        goal_objective_id: number | null;
        is_active: boolean;
        notes: string | null;
      }>;
    }) => updateMacroPlan(id, updates),
    onSuccess: () => invalidatePlans(queryClient),
  });
}

export function useDeleteMacroPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteMacroPlan(id),
    onSuccess: () => invalidatePlans(queryClient),
  });
}

// ----------------------------- Training blocks -----------------------------

export function useCreateTrainingBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      planId,
      block,
    }: {
      planId: number;
      block: {
        name: string;
        block_type: BlockType;
        start_date: string;
        end_date: string;
        focus?: string | null;
        color?: string | null;
        block_order?: number;
      };
    }) => createTrainingBlock(planId, block),
    onSuccess: () => invalidatePlans(queryClient),
  });
}

export function useUpdateTrainingBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      blockId,
      updates,
    }: {
      blockId: number;
      updates: Partial<{
        name: string;
        block_type: BlockType;
        start_date: string;
        end_date: string;
        focus: string | null;
        color: string | null;
        block_order: number;
      }>;
    }) => updateTrainingBlock(blockId, updates),
    onSuccess: () => invalidatePlans(queryClient),
  });
}

export function useDeleteTrainingBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blockId: number) => deleteTrainingBlock(blockId),
    onSuccess: () => invalidatePlans(queryClient),
  });
}
