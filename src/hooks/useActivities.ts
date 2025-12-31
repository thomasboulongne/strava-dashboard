import { useQuery } from "@tanstack/react-query";
import { getActivities, type ActivitiesResponse } from "../lib/api";
import type { Activity } from "../lib/strava-types";

// Fetch all activities at once from DB (they're already synced server-side)
const DEFAULT_LIMIT = 10000;

// Time threshold to consider cache fresh (30 seconds)
const CACHE_FRESH_THRESHOLD_MS = 1000 * 30;

export function useActivities(_perPage: number = DEFAULT_LIMIT) {
  const query = useQuery<ActivitiesResponse>({
    queryKey: ["activities"],
    queryFn: () => getActivities(DEFAULT_LIMIT, 0),
    staleTime: CACHE_FRESH_THRESHOLD_MS,
    refetchOnMount: true,
  });

  // Transform to match the old interface for backward compatibility
  const activities: Activity[] = query.data?.activities ?? [];
  const total = query.data?.total ?? 0;
  const hasMore = query.data?.hasMore ?? false;

  return {
    ...query,
    // Provide data in the old paginated format for compatibility
    data:
      activities.length > 0
        ? { pages: [activities], pageParams: [1] }
        : undefined,
    // No more client-side pagination - all data comes from DB
    hasNextPage: hasMore,
    isFetchingNextPage: false,
    fetchNextPage: () =>
      Promise.resolve({ pages: [activities], pageParams: [1] }),
    // Metadata
    total,
    isHistoryComplete: !hasMore,
  };
}
