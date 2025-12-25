import { useInfiniteQuery } from "@tanstack/react-query";
import { getActivities } from "../lib/api";
import type { Activity } from "../lib/strava-types";

const PER_PAGE = 30;

export function useActivities() {
  return useInfiniteQuery<Activity[]>({
    queryKey: ["activities"],
    queryFn: ({ pageParam }) => getActivities(pageParam as number, PER_PAGE),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      // If we got fewer results than requested, we've reached the end
      if (lastPage.length < PER_PAGE) {
        return undefined;
      }
      return (lastPageParam as number) + 1;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

