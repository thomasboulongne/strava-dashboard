import { create } from "zustand";
import type { Athlete } from "../lib/strava-types";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  athlete: Pick<Athlete, "id" | "firstname" | "lastname" | "profile"> | null;
  setAuthenticated: (
    athlete: Pick<Athlete, "id" | "firstname" | "lastname" | "profile">
  ) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: false,
  athlete: null,

  setAuthenticated: (athlete) =>
    set({
      isAuthenticated: true,
      isLoading: false,
      athlete,
    }),

  setLoading: (loading) =>
    set({
      isLoading: loading,
    }),

  logout: () =>
    set({
      isAuthenticated: false,
      isLoading: false,
      athlete: null,
    }),

  reset: () =>
    set({
      isAuthenticated: false,
      isLoading: true,
      athlete: null,
    }),
}));
