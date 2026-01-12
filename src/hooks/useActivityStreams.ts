import { useQuery } from "@tanstack/react-query";
import { getActivityStreams } from "../lib/api";
import type { ActivityStreamsResponse } from "../lib/strava-types";

// Cache streams for 5 minutes
const CACHE_TIME_MS = 1000 * 60 * 5;

// Fetch all activity streams for the athlete
export function useActivityStreams(limit?: number) {
  return useQuery<ActivityStreamsResponse>({
    queryKey: ["activityStreams", limit],
    queryFn: () => getActivityStreams(undefined, limit),
    staleTime: CACHE_TIME_MS,
    refetchOnMount: false,
  });
}

// Fetch streams for specific activities
export function useActivityStreamsBatch(activityIds: number[]) {
  return useQuery<ActivityStreamsResponse>({
    queryKey: ["activityStreams", "batch", activityIds],
    queryFn: () => getActivityStreams(activityIds),
    staleTime: CACHE_TIME_MS,
    enabled: activityIds.length > 0,
    refetchOnMount: false,
  });
}



