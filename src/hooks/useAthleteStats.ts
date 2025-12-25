import { useQuery } from "@tanstack/react-query";
import { getAthleteStats } from "../lib/api";
import type { AthleteStats } from "../lib/strava-types";

export function useAthleteStats(athleteId: number | undefined) {
  return useQuery<AthleteStats>({
    queryKey: ["athleteStats", athleteId],
    queryFn: () => getAthleteStats(athleteId!),
    enabled: !!athleteId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

