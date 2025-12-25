import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getAthlete } from "../lib/api";
import { useAuthStore } from "../stores/authStore";
import type { Athlete } from "../lib/strava-types";

export function useAthlete() {
  const { setAuthenticated, setLoading, logout } = useAuthStore();

  const query = useQuery<Athlete>({
    queryKey: ["athlete"],
    queryFn: getAthlete,
    retry: false,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  useEffect(() => {
    if (query.isSuccess && query.data) {
      setAuthenticated({
        id: query.data.id,
        firstname: query.data.firstname,
        lastname: query.data.lastname,
        profile: query.data.profile,
      });
    } else if (query.isError) {
      logout();
    } else if (query.isLoading) {
      setLoading(true);
    }
  }, [query.isSuccess, query.isError, query.isLoading, query.data, setAuthenticated, logout, setLoading]);

  return query;
}

