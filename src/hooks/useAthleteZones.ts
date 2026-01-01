import { useQuery } from "@tanstack/react-query";
import { getAthleteZones } from "../lib/api";
import type { AthleteZonesResponse } from "../lib/strava-types";

// Cache zones for 30 minutes (they rarely change)
const CACHE_TIME_MS = 1000 * 60 * 30;

export function useAthleteZones() {
  return useQuery<AthleteZonesResponse>({
    queryKey: ["athleteZones"],
    queryFn: getAthleteZones,
    staleTime: CACHE_TIME_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

