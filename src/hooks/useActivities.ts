import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  const { athlete } = useAuthStore();
  const {
    activities: cachedActivities,
    addActivities,
    validateCache,
    setFetchingComplete,
    isFetchingComplete,
  } = useActivitiesStore();

  // Validate cache for current athlete on mount
  useEffect(() => {
    if (athlete?.id) {
      validateCache(athlete.id);
    }
  }, [athlete?.id, validateCache]);

  // Pre-populate query cache with cached activities on mount
  useEffect(() => {
    if (cachedActivities.length > 0) {
      queryClient.setQueryData(["activities", perPage], {
        pages: [cachedActivities],
        pageParams: [1],
      });
    }
  }, [queryClient, perPage, cachedActivities]);

  const query = useInfiniteQuery<Activity[]>({
    queryKey: ["activities", perPage],
    queryFn: async ({ pageParam }) => {
      const page = pageParam as number;

      // Get fresh state from store (avoid stale closures)
      const state = getStoreState();

      // For pages beyond 1, check if we already have all historical data
      if (page > 1 && state.isFetchingComplete) {
        // We've already fetched all historical data, return empty to signal end
        return [];
      }

      const fetched = await getActivities(page, perPage);

      if (fetched.length > 0) {
        // Add to store (handles deduplication and sorting)
        addActivities(fetched);

        // Check if we've reached activities we already have
        const currentState = getStoreState();
        if (page > 1 && currentState.oldestActivityDate) {
          const oldestFetched = new Date(
            fetched[fetched.length - 1].start_date_local
          );
          // If we're fetching activities older than what we have, we might have them all
          if (oldestFetched <= currentState.oldestActivityDate) {
            // Check if all fetched activities are already in cache
            const allAlreadyCached = fetched.every((activity) =>
              currentState.activities.some(
                (cached) => cached.id === activity.id
              )
            );
            if (allAlreadyCached) {
              setFetchingComplete(true);
            }
          }
        }
      }

      // If we got fewer than requested, we've reached the end
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

      // If we've completed fetching all historical data, stop
      if (state.isFetchingComplete) {
        return undefined;
      }

      return (lastPageParam as number) + 1;
    },
    staleTime: CACHE_FRESH_THRESHOLD_MS,
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

  // Override hasNextPage based on store state
  // This ensures we don't trigger fetches when we already have all data
  const hasNextPage = !isFetchingComplete && (query.hasNextPage ?? true);

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
