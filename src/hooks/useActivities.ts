import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useCallback } from "react";
import { getActivities } from "../lib/api";
import { useActivitiesStore } from "../stores/activitiesStore";
import { useAuthStore } from "../stores/authStore";
import type { Activity } from "../lib/strava-types";

const DEFAULT_PER_PAGE = 30;

// Time threshold to consider cache fresh (5 minutes) - used for staleTime
const CACHE_FRESH_THRESHOLD_MS = 1000 * 60 * 5;

// Get fresh state from the store (avoids stale closure issues)
const getStoreState = () => useActivitiesStore.getState();

export function useActivities(perPage: number = DEFAULT_PER_PAGE) {
  const { athlete } = useAuthStore();
  const {
    activities: cachedActivities,
    addActivities,
    validateCache,
    setFetchingComplete,
    isFetchingComplete,
    setHasFoundOverlap,
    startSyncSession,
  } = useActivitiesStore();

  // Validate cache and start sync session on mount
  useEffect(() => {
    if (athlete?.id) {
      validateCache(athlete.id);
      startSyncSession();
    }
  }, [athlete?.id, validateCache, startSyncSession]);

  const query = useInfiniteQuery<Activity[]>({
    queryKey: ["activities", perPage],
    queryFn: async ({ pageParam }) => {
      const page = pageParam as number;

      // Get fresh state from store BEFORE fetching (to check for overlap)
      const stateBefore = getStoreState();
      const existingIds = new Set(stateBefore.activities.map((a) => a.id));

      const fetched = await getActivities(page, perPage);

      if (fetched.length > 0) {
        // Check for overlap BEFORE adding to store
        // Only relevant if we had cached data at sync start
        if (stateBefore.cacheCountAtSyncStart > 0) {
          const hasOverlap = fetched.some((a) => existingIds.has(a.id));
          if (hasOverlap) {
            setHasFoundOverlap(true);
          }
        }

        // Add to store (handles deduplication and sorting)
        addActivities(fetched);
      }

      // If we got fewer than requested, we've reached the end of all Strava data
      if (fetched.length < perPage) {
        setFetchingComplete(true);
      }

      return fetched;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      // If we got fewer results than requested, we've reached the end
      if (lastPage.length < perPage) {
        return undefined;
      }

      // Get fresh state from store (avoid stale closures)
      const state = getStoreState();

      // If we had cached data at sync start and found overlap, we've bridged the gap
      // No need to fetch more pages for "new activities"
      if (state.cacheCountAtSyncStart > 0 && state.hasFoundOverlap) {
        // But we might still need historical data if we haven't fetched it all
        if (state.isFetchingComplete) {
          return undefined;
        }
        // We've got all new activities, stop pagination
        return undefined;
      }

      // If we've completed fetching all historical data, stop
      if (state.isFetchingComplete) {
        return undefined;
      }

      return (lastPageParam as number) + 1;
    },
    staleTime: CACHE_FRESH_THRESHOLD_MS,
    // Always refetch page 1 on mount to check for new activities
    refetchOnMount: "always",
  });

  // Return merged data from store (which is always up to date)
  const mergedData = useCallback(() => {
    if (cachedActivities.length === 0 && !query.data?.pages?.length) {
      return undefined;
    }

    return {
      pages: [cachedActivities],
      pageParams: [1],
    };
  }, [cachedActivities, query.data]);

  // Get session state for hasNextPage calculation
  const { hasFoundOverlap, cacheCountAtSyncStart } = useActivitiesStore();

  // Override hasNextPage based on store state
  // Stop pagination if:
  // 1. We've found overlap with cached data (bridged the gap for new activities)
  // 2. OR we've fetched all historical data
  const shouldStopPagination =
    isFetchingComplete || (cacheCountAtSyncStart > 0 && hasFoundOverlap);
  const hasNextPage = !shouldStopPagination && (query.hasNextPage ?? true);

  return {
    ...query,
    // Override data with store data (always merged and sorted)
    data: mergedData(),
    // Override hasNextPage to reflect store state
    hasNextPage,
    // Expose isFetchingComplete for components that need it
    isHistoryComplete: isFetchingComplete,
  };
}
