import { useInfiniteQuery } from "@tanstack/react-query";
import { getActivities } from "../lib/api";
import type { Activity } from "../lib/strava-types";

const DEFAULT_PER_PAGE = 30;

export function useActivities(perPage: number = DEFAULT_PER_PAGE) {
  return useInfiniteQuery<Activity[]>({
    queryKey: ["activities", perPage],
    queryFn: ({ pageParam }) => getActivities(pageParam as number, perPage),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      // If we got fewer results than requested, we've reached the end
      if (lastPage.length < perPage) {
        return undefined;
      }
      return (lastPageParam as number) + 1;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
