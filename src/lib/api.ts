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
import {
  getStoredSession,
  updateStoredSession,
} from "../hooks/useSessionCapture";

// Use VITE_API_URL env var if set, otherwise default to relative /api path
// This allows explicit configuration for different environments
const API_BASE = import.meta.env.VITE_API_URL || "/api";

/**
 * Get auth headers for API requests.
 * Uses localStorage session for PWA support (since PWAs have isolated cookies).
 */
function getAuthHeaders(): Record<string, string> {
  const session = getStoredSession();
  if (session?.accessToken) {
    return { Authorization: `Bearer ${session.accessToken}` };
  }
  return {};
}

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Track if we're currently refreshing to avoid multiple simultaneous refreshes
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  // If already refreshing, wait for that to complete
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      // For PWA support, include the refresh token in the request body
      const session = getStoredSession();
      const response = await fetch(`${API_BASE}/refresh`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: session?.refreshToken
          ? JSON.stringify({ refreshToken: session.refreshToken })
          : undefined,
      });

      if (response.ok) {
        // Update localStorage with new tokens if returned
        const data = await response.json();
        if (data.accessToken) {
          updateStoredSession({
            accessToken: data.accessToken,
            expiresAt: data.expiresAt,
            ...(data.refreshToken && { refreshToken: data.refreshToken }),
          });
        }
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit,
  isRetry = false,
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: "include", // Include cookies
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(), // PWA support: include token from localStorage
      ...options?.headers,
    },
  });

  // If unauthorized and not already a retry, try refreshing the token
  if (response.status === 401 && !isRetry) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // Retry the original request
      return fetchApi<T>(endpoint, options, true);
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      errorData.error || `Request failed with status ${response.status}`,
      response.status,
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
  athleteId: number,
): Promise<AthleteStats> {
  return fetchApi<AthleteStats>(`/stats?athleteId=${athleteId}`);
}

// Sync status types
export interface StreamsSyncProgress {
  total: number;
  withStreams: number;
  pending: number;
}

export interface LapsSyncProgress {
  total: number;
  withLaps: number;
  pending: number;
}

export interface SyncStatusResponse {
  activityCount: number;
  latestActivityDate: string | null;
  streams?: StreamsSyncProgress;
  laps?: LapsSyncProgress;
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
  return fetchApi<StreamsSyncTriggerResponse>("/sync-streams", {
    method: "POST",
  });
}

// Laps sync types
export interface LapsSyncStatusResponse {
  laps: LapsSyncProgress;
  percentComplete: number;
}

export interface LapsSyncTriggerResponse {
  status: "in_progress" | "completed" | "paused";
  synced?: number;
  skipped?: number;
  hasMore?: boolean;
  reason?: string;
  laps: LapsSyncProgress;
}

// Laps sync endpoints
export async function getLapsSyncStatus(): Promise<LapsSyncStatusResponse> {
  return fetchApi<LapsSyncStatusResponse>("/sync-laps");
}

export async function triggerLapsSync(): Promise<LapsSyncTriggerResponse> {
  return fetchApi<LapsSyncTriggerResponse>("/sync-laps", {
    method: "POST",
  });
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
  offset = 0,
): Promise<ActivitiesResponse> {
  return fetchApi<ActivitiesResponse>(
    `/activities?limit=${limit}&offset=${offset}`,
  );
}

// Athlete zones endpoint
export async function getAthleteZones(): Promise<AthleteZonesResponse> {
  return fetchApi<AthleteZonesResponse>("/zones");
}

// Activity streams endpoint - batch fetch
export async function getActivityStreams(
  activityIds?: number[],
  limit?: number,
): Promise<ActivityStreamsResponse> {
  if (activityIds && activityIds.length > 0) {
    return fetchApi<ActivityStreamsResponse>(
      `/activity-streams?activityIds=${activityIds.join(",")}`,
    );
  }
  if (limit) {
    return fetchApi<ActivityStreamsResponse>(
      `/activity-streams?limit=${limit}`,
    );
  }
  return fetchApi<ActivityStreamsResponse>("/activity-streams");
}

// Activity laps types and endpoint
export interface ActivityLapsResponse {
  laps: Record<number, Array<{
    id: number;
    activity_id: number;
    athlete_id: number;
    lap_index: number;
    data: Record<string, unknown>;
    start_date: string;
    elapsed_time: number;
    moving_time: number;
    distance: number;
    created_at: string;
    updated_at: string;
  }>>;
  count: number;
}

export interface SingleActivityLapsResponse {
  laps: Array<{
    id: number;
    activity_id: number;
    athlete_id: number;
    lap_index: number;
    data: Record<string, unknown>;
    start_date: string;
    elapsed_time: number;
    moving_time: number;
    distance: number;
    created_at: string;
    updated_at: string;
  }>;
  activityId: number;
}

// Activity laps endpoint - fetch laps for activities
export async function getActivityLaps(
  activityId: number
): Promise<SingleActivityLapsResponse> {
  return fetchApi<SingleActivityLapsResponse>(
    `/activity-laps?activityId=${activityId}`
  );
}

export async function getActivityLapsBatch(
  activityIds: number[]
): Promise<ActivityLapsResponse> {
  return fetchApi<ActivityLapsResponse>(
    `/activity-laps?activityIds=${activityIds.join(",")}`
  );
}

// Training Plan endpoints
export async function getTrainingPlan(
  weekStart: string, // YYYY-MM-DD format
): Promise<TrainingPlanResponse> {
  return fetchApi<TrainingPlanResponse>(`/training-plans?week=${weekStart}`);
}

export async function importTrainingPlan(
  markdown: string,
  referenceDate?: string,
): Promise<ImportPlanResponse> {
  return fetchApi<ImportPlanResponse>("/training-plans", {
    method: "POST",
    body: JSON.stringify({ markdown, referenceDate }),
  });
}

export async function linkActivityToWorkout(
  workoutId: number,
  activityId: number,
): Promise<LinkActivityResponse> {
  return fetchApi<LinkActivityResponse>(`/training-plans/${workoutId}/link`, {
    method: "PATCH",
    body: JSON.stringify({ activityId }),
  });
}

export async function unlinkActivityFromWorkout(
  workoutId: number,
): Promise<LinkActivityResponse> {
  return fetchApi<LinkActivityResponse>(`/training-plans/${workoutId}/unlink`, {
    method: "PATCH",
  });
}

export async function deleteTrainingPlan(
  weekStart: string,
): Promise<DeletePlanResponse> {
  return fetchApi<DeletePlanResponse>(`/training-plans?week=${weekStart}`, {
    method: "DELETE",
  });
}

export { ApiError };
