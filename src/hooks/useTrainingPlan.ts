import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTrainingPlan,
  importTrainingPlan,
  linkActivityToWorkout,
  unlinkActivityFromWorkout,
  deleteTrainingPlan,
} from "../lib/api";
import type { TrainingPlanResponse } from "../lib/strava-types";

// Cache time: 30 seconds
const STALE_TIME = 1000 * 30;

/**
 * Parse a YYYY-MM-DD string into a Date object in local timezone
 * (avoids timezone issues with new Date(string) which parses as UTC)
 */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a date to YYYY-MM-DD in local timezone
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format a date from DB to YYYY-MM-DD
 * DB dates are stored as DATE type and may come back as Date objects at UTC midnight
 * We use UTC methods to avoid timezone shift issues
 */
export function formatDbDate(date: Date | string): string {
  if (typeof date === "string") {
    return date.split("T")[0];
  }
  // Date object from DB - use UTC methods to avoid timezone shift
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Get Monday of the week containing the given date
 */
export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  // Adjust to Monday (day 1). If Sunday (0), go back 6 days
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatLocalDate(d);
}

/**
 * Get the next week's Monday
 */
export function getNextWeek(currentWeekStart: string): string {
  const d = parseLocalDate(currentWeekStart);
  d.setDate(d.getDate() + 7);
  return formatLocalDate(d);
}

/**
 * Get the previous week's Monday
 */
export function getPreviousWeek(currentWeekStart: string): string {
  const d = parseLocalDate(currentWeekStart);
  d.setDate(d.getDate() - 7);
  return formatLocalDate(d);
}

/**
 * Format week range for display (e.g., "Jan 5 - 11, 2026")
 */
export function formatWeekRange(weekStart: string): string {
  const start = parseLocalDate(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const startMonth = start.toLocaleDateString("en-US", { month: "short" });
  const endMonth = end.toLocaleDateString("en-US", { month: "short" });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = start.getFullYear();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

/**
 * Hook to fetch training plan for a week
 */
export function useTrainingPlan(weekStart: string) {
  return useQuery<TrainingPlanResponse>({
    queryKey: ["trainingPlan", weekStart],
    queryFn: () => getTrainingPlan(weekStart),
    staleTime: STALE_TIME,
    enabled: !!weekStart,
  });
}

/**
 * Hook to import a training plan from markdown
 */
export function useImportPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      markdown,
      referenceDate,
    }: {
      markdown: string;
      referenceDate?: string;
    }) => importTrainingPlan(markdown, referenceDate),
    onSuccess: (data) => {
      // Invalidate the weeks that were affected
      if (data.workouts.length > 0) {
        // Get unique week starts from the imported workouts
        const weekStarts = new Set<string>();
        data.workouts.forEach((w) => {
          const ws = getWeekStart(new Date(w.workout_date));
          weekStarts.add(ws);
        });

        // Invalidate each affected week
        weekStarts.forEach((ws) => {
          queryClient.invalidateQueries({ queryKey: ["trainingPlan", ws] });
        });
      }
    },
  });
}

/**
 * Hook to link an activity to a workout
 */
export function useLinkActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workoutId,
      activityId,
    }: {
      workoutId: number;
      activityId: number;
    }) => linkActivityToWorkout(workoutId, activityId),
    onSuccess: () => {
      // Invalidate all training plan queries to refresh
      queryClient.invalidateQueries({ queryKey: ["trainingPlan"] });
    },
  });
}

/**
 * Hook to unlink an activity from a workout
 */
export function useUnlinkActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workoutId: number) => unlinkActivityFromWorkout(workoutId),
    onSuccess: () => {
      // Invalidate all training plan queries to refresh
      queryClient.invalidateQueries({ queryKey: ["trainingPlan"] });
    },
  });
}

/**
 * Hook to delete a training plan for a week
 */
export function useDeletePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (weekStart: string) => deleteTrainingPlan(weekStart),
    onSuccess: (_data, weekStart) => {
      // Invalidate the specific week
      queryClient.invalidateQueries({ queryKey: ["trainingPlan", weekStart] });
    },
  });
}

