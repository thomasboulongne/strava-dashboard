import { create } from "zustand";
import { persist } from "zustand/middleware";

// Minimal client-side store for athlete preferences
// Activities are now stored server-side in Neon DB
interface ActivitiesState {
  // Just track which athlete is logged in for cache invalidation
  athleteId: number | null;
  // Legacy flag for backward compatibility with some components
  isFetchingComplete: boolean;

  // Actions
  setAthleteId: (athleteId: number) => void;
  clearStore: () => void;
}

export const useActivitiesStore = create<ActivitiesState>()(
  persist(
    (set) => ({
      athleteId: null,
      isFetchingComplete: true, // Always true since server has all data

      setAthleteId: (athleteId) => {
        set({ athleteId });
      },

      clearStore: () => {
        set({
          athleteId: null,
          isFetchingComplete: true,
        });
      },
    }),
    {
      name: "strava-activities-storage",
      partialize: (state) => ({
        athleteId: state.athleteId,
      }),
    }
  )
);

