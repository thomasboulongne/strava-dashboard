// API client for communicating with Netlify Functions

import type {
  Athlete,
  AthleteStats,
  Activity,
  AthleteZonesResponse,
  ActivityStreamsResponse,
  TrainingPlanResponse,
  ImportPlanResponse,
  LinkActivityResponse,
  DeletePlanResponse,
} from "./strava-types";

// Use VITE_API_URL env var if set, otherwise default to relative /api path
// This allows explicit configuration for different environments
const API_BASE = import.meta.env.VITE_API_URL || "/api";

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: "include", // Include cookies
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      errorData.error || `Request failed with status ${response.status}`,
      response.status
    );
  }

  return response.json();
}

// Auth endpoints
export async function getAuthUrl(): Promise<{ url: string }> {
  return fetchApi<{ url: string }>("/auth");
}

export async function refreshToken(): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>("/refresh", { method: "POST" });
}

// Data endpoints
export async function getAthlete(): Promise<Athlete> {
  return fetchApi<Athlete>("/athlete");
}

export async function getAthleteStats(
  athleteId: number
): Promise<AthleteStats> {
  return fetchApi<AthleteStats>(`/stats?athleteId=${athleteId}`);
}

// Sync status types
export interface StreamsSyncProgress {
  total: number;
  withStreams: number;
  pending: number;
}

export interface SyncStatusResponse {
  activityCount: number;
  latestActivityDate: string | null;
  streams?: StreamsSyncProgress;
  // Legacy - no longer used
  syncJob: null;
}

export interface SyncTriggerResponse {
  status: "in_progress" | "completed" | "paused" | "failed";
  reason?: string;
  totalSynced?: number;
  checkedCount?: number;
  hasMore?: boolean;
  foundExisting?: boolean;
  activityCount?: number;
  error?: string;
}

// Sync endpoints
export async function getSyncStatus(): Promise<SyncStatusResponse> {
  return fetchApi<SyncStatusResponse>("/sync");
}

export async function triggerSync(): Promise<SyncTriggerResponse> {
  return fetchApi<SyncTriggerResponse>("/sync", { method: "POST" });
}

// Streams sync types
export interface StreamsSyncStatusResponse {
  streams: StreamsSyncProgress;
  percentComplete: number;
}

export interface StreamsSyncTriggerResponse {
  status: "in_progress" | "completed" | "paused";
  synced?: number;
  skipped?: number;
  hasMore?: boolean;
  reason?: string;
  streams: StreamsSyncProgress;
}

// Streams sync endpoints
export async function getStreamsSyncStatus(): Promise<StreamsSyncStatusResponse> {
  return fetchApi<StreamsSyncStatusResponse>("/sync-streams");
}

export async function triggerStreamsSync(): Promise<StreamsSyncTriggerResponse> {
  return fetchApi<StreamsSyncTriggerResponse>("/sync-streams", { method: "POST" });
}

// Activities response type (new format from DB)
export interface ActivitiesResponse {
  activities: Activity[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Activities endpoint - fetches from DB
export async function getActivities(
  limit = 200,
  offset = 0
): Promise<ActivitiesResponse> {
  return fetchApi<ActivitiesResponse>(`/activities?limit=${limit}&offset=${offset}`);
}

// Athlete zones endpoint
export async function getAthleteZones(): Promise<AthleteZonesResponse> {
  return fetchApi<AthleteZonesResponse>("/zones");
}

// Activity streams endpoint - batch fetch
export async function getActivityStreams(
  activityIds?: number[],
  limit?: number
): Promise<ActivityStreamsResponse> {
  if (activityIds && activityIds.length > 0) {
    return fetchApi<ActivityStreamsResponse>(
      `/activity-streams?activityIds=${activityIds.join(",")}`
    );
  }
  if (limit) {
    return fetchApi<ActivityStreamsResponse>(`/activity-streams?limit=${limit}`);
  }
  return fetchApi<ActivityStreamsResponse>("/activity-streams");
}

// Training Plan endpoints
export async function getTrainingPlan(
  weekStart: string // YYYY-MM-DD format
): Promise<TrainingPlanResponse> {
  return fetchApi<TrainingPlanResponse>(`/training-plans?week=${weekStart}`);
}

export async function importTrainingPlan(
  markdown: string,
  referenceDate?: string
): Promise<ImportPlanResponse> {
  return fetchApi<ImportPlanResponse>("/training-plans", {
    method: "POST",
    body: JSON.stringify({ markdown, referenceDate }),
  });
}

export async function linkActivityToWorkout(
  workoutId: number,
  activityId: number
): Promise<LinkActivityResponse> {
  return fetchApi<LinkActivityResponse>(`/training-plans/${workoutId}/link`, {
    method: "PATCH",
    body: JSON.stringify({ activityId }),
  });
}

export async function unlinkActivityFromWorkout(
  workoutId: number
): Promise<LinkActivityResponse> {
  return fetchApi<LinkActivityResponse>(`/training-plans/${workoutId}/unlink`, {
    method: "PATCH",
  });
}

export async function deleteTrainingPlan(
  weekStart: string
): Promise<DeletePlanResponse> {
  return fetchApi<DeletePlanResponse>(`/training-plans?week=${weekStart}`, {
    method: "DELETE",
  });
}

export { ApiError };
