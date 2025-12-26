// API client for communicating with Netlify Functions

import type { Athlete, AthleteStats, Activity } from "./strava-types";

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

export async function getActivities(
  page = 1,
  perPage = 30
): Promise<Activity[]> {
  return fetchApi<Activity[]>(`/activities?page=${page}&per_page=${perPage}`);
}

export { ApiError };
