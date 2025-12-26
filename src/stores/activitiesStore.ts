import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Activity } from "../lib/strava-types";

interface ActivitiesState {
  // Stored activities (sorted by date, newest first)
  activities: Activity[];
  // Metadata
  oldestActivityDate: Date | null;
  newestActivityDate: Date | null;
  lastSyncTime: number;
  athleteId: number | null;
  // Flag to track if we've fetched all historical data
  isFetchingComplete: boolean;

  // Actions
  addActivities: (newActivities: Activity[]) => void;
  validateCache: (athleteId: number) => boolean;
  clearActivities: () => void;
  setFetchingComplete: (complete: boolean) => void;
}

export const useActivitiesStore = create<ActivitiesState>()(
  persist(
    (set, get) => ({
      activities: [],
      oldestActivityDate: null,
      newestActivityDate: null,
      lastSyncTime: 0,
      athleteId: null,
      isFetchingComplete: false,

      addActivities: (newActivities) => {
        if (newActivities.length === 0) return;

        const state = get();
        const existingIds = new Set(state.activities.map((a) => a.id));

        // Filter out duplicates
        const uniqueNew = newActivities.filter((a) => !existingIds.has(a.id));

        if (uniqueNew.length === 0) {
          // All activities already exist, just update sync time
          set({ lastSyncTime: Date.now() });
          return;
        }

        // Merge and sort by date descending
        const merged = [...state.activities, ...uniqueNew].sort(
          (a, b) =>
            new Date(b.start_date_local).getTime() -
            new Date(a.start_date_local).getTime()
        );

        // Calculate date bounds
        const newestActivityDate = new Date(merged[0].start_date_local);
        const oldestActivityDate = new Date(
          merged[merged.length - 1].start_date_local
        );

        set({
          activities: merged,
          newestActivityDate,
          oldestActivityDate,
          lastSyncTime: Date.now(),
        });
      },

      validateCache: (athleteId) => {
        const state = get();

        // If athlete ID changed, invalidate cache
        if (state.athleteId !== null && state.athleteId !== athleteId) {
          set({
            activities: [],
            oldestActivityDate: null,
            newestActivityDate: null,
            lastSyncTime: 0,
            athleteId,
            isFetchingComplete: false,
          });
          return false;
        }

        // Update athlete ID if not set
        if (state.athleteId === null) {
          set({ athleteId });
        }

        return true;
      },

      clearActivities: () => {
        set({
          activities: [],
          oldestActivityDate: null,
          newestActivityDate: null,
          lastSyncTime: 0,
          isFetchingComplete: false,
        });
      },

      setFetchingComplete: (complete) => {
        set({ isFetchingComplete: complete });
      },
    }),
    {
      name: "strava-activities-storage",
      // Only persist specific fields
      partialize: (state) => ({
        activities: state.activities,
        oldestActivityDate: state.oldestActivityDate,
        newestActivityDate: state.newestActivityDate,
        lastSyncTime: state.lastSyncTime,
        athleteId: state.athleteId,
        isFetchingComplete: state.isFetchingComplete,
      }),
      // Handle date serialization/deserialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          // Convert date strings back to Date objects
          if (parsed.state) {
            if (parsed.state.oldestActivityDate) {
              parsed.state.oldestActivityDate = new Date(
                parsed.state.oldestActivityDate
              );
            }
            if (parsed.state.newestActivityDate) {
              parsed.state.newestActivityDate = new Date(
                parsed.state.newestActivityDate
              );
            }
          }
          return parsed;
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);

// Selector hooks for common access patterns
export const useActivitiesCount = () =>
  useActivitiesStore((state) => state.activities.length);

export const useOldestActivityDate = () =>
  useActivitiesStore((state) => state.oldestActivityDate);

export const useNewestActivityDate = () =>
  useActivitiesStore((state) => state.newestActivityDate);

