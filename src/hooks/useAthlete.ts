import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ApiError, getAthlete } from "../lib/api";
import { useAuthStore } from "../stores/authStore";
import type { Athlete } from "../lib/strava-types";
import { clearStoredSession } from "./useSessionCapture";

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
      return;
    }

    if (query.isError) {
      const error = query.error;
      if (error instanceof ApiError && error.status === 401) {
        // Clear local session to avoid redirect loops
        clearStoredSession();
        logout();
      } else {
        setLoading(false);
      }
      return;
    }

    if (query.isLoading) {
      setLoading(true);
    }
  }, [
    query.isSuccess,
    query.isError,
    query.isLoading,
    query.data,
    query.error,
    setAuthenticated,
    logout,
    setLoading,
  ]);

  return query;
}

