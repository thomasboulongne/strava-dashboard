import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSyncStatus,
  triggerSync,
  triggerStreamsSync,
  type SyncStatusResponse,
  type SyncTriggerResponse,
  type StreamsSyncTriggerResponse,
} from "../lib/api";

// Polling interval for sync status (longer since we rely on webhooks)
const STATUS_POLL_INTERVAL = 60000; // 1 minute
// Faster polling during active sync
const ACTIVE_SYNC_POLL_INTERVAL = 3000;

export function useSync() {
  const queryClient = useQueryClient();
  // State for render-time values
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [streamsSyncInProgress, setStreamsSyncInProgress] = useState(false);
  // Refs for synchronous access in callbacks/effects
  const syncInProgressRef = useRef(false);
  const streamsSyncInProgressRef = useRef(false);
  const hasCheckedInitialSyncRef = useRef(false);
  const streamsSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // Query for sync status
  const {
    data: syncStatus,
    isLoading: statusLoading,
    error: statusError,
    refetch: refetchStatus,
  } = useQuery<SyncStatusResponse>({
    queryKey: ["syncStatus"],
    queryFn: getSyncStatus,
    // Poll less frequently since webhooks keep us up-to-date
    refetchInterval: () => {
      if (syncInProgressRef.current || streamsSyncInProgressRef.current) {
        return ACTIVE_SYNC_POLL_INTERVAL;
      }
      return STATUS_POLL_INTERVAL;
    },
    staleTime: 5000,
  });

  // Mutation to trigger/continue activity sync
  const { mutate: triggerSyncMutation, isPending: isSyncing } =
    useMutation<SyncTriggerResponse>({
      mutationFn: triggerSync,
      onSuccess: (data) => {
        // Invalidate activities cache when sync makes progress
        if (data.totalSynced && data.totalSynced > 0) {
          queryClient.invalidateQueries({ queryKey: ["activities"] });
        }

        // Refetch status to get updated count
        refetchStatus();

        // If sync is still in progress and has more, continue
        if (data.status === "in_progress" && data.hasMore) {
          syncInProgressRef.current = true;
          setSyncInProgress(true);
          setTimeout(() => {
            if (syncInProgressRef.current) {
              triggerSyncMutation();
            }
          }, 500);
        } else {
          syncInProgressRef.current = false;
          setSyncInProgress(false);
        }
      },
      onError: () => {
        syncInProgressRef.current = false;
        setSyncInProgress(false);
      },
    });

  // Mutation to trigger/continue streams sync
  const { mutate: triggerStreamsSyncMutation, isPending: isStreamsSyncing } =
    useMutation<StreamsSyncTriggerResponse>({
      mutationFn: triggerStreamsSync,
      onSuccess: (data) => {
        refetchStatus();

        if (data.status === "in_progress" && data.hasMore) {
          streamsSyncInProgressRef.current = true;
          setStreamsSyncInProgress(true);
          setTimeout(() => {
            if (streamsSyncInProgressRef.current) {
              triggerStreamsSyncMutation();
            }
          }, 1000);
        } else {
          streamsSyncInProgressRef.current = false;
          setStreamsSyncInProgress(false);
        }
      },
      onError: () => {
        streamsSyncInProgressRef.current = false;
        setStreamsSyncInProgress(false);
      },
    });

  // Manually trigger a sync (for refresh button)
  const forceSync = useCallback(() => {
    if (syncInProgressRef.current) return;
    syncInProgressRef.current = true;
    setSyncInProgress(true);
    triggerSyncMutation();
  }, [triggerSyncMutation]);

  // Stop ongoing activity sync
  const stopSync = useCallback(() => {
    syncInProgressRef.current = false;
    setSyncInProgress(false);
  }, []);

  // Start streams sync
  const startStreamsSync = useCallback(() => {
    if (streamsSyncInProgressRef.current) return;
    streamsSyncInProgressRef.current = true;
    setStreamsSyncInProgress(true);
    triggerStreamsSyncMutation();
  }, [triggerStreamsSyncMutation]);

  // Stop streams sync
  const stopStreamsSync = useCallback(() => {
    streamsSyncInProgressRef.current = false;
    setStreamsSyncInProgress(false);
  }, []);

  // Auto-trigger initial sync ONLY if we have 0 activities
  // This handles brand new users who need their history imported
  const activityCount = syncStatus?.activityCount ?? 0;
  useEffect(() => {
    if (
      !statusLoading &&
      !hasCheckedInitialSyncRef.current &&
      activityCount === 0 &&
      !syncInProgressRef.current
    ) {
      hasCheckedInitialSyncRef.current = true;
      console.log("No activities found, triggering initial sync...");
      // Set ref for synchronous checks; state will be set by mutation callbacks
      syncInProgressRef.current = true;
      triggerSyncMutation();
    } else if (!statusLoading && activityCount > 0) {
      hasCheckedInitialSyncRef.current = true;
    }
  }, [statusLoading, activityCount, triggerSyncMutation]);

  // Auto-start streams sync after we have activities and there are pending streams
  const streamsPending = syncStatus?.streams?.pending ?? 0;
  useEffect(() => {
    if (
      !statusLoading &&
      activityCount > 0 &&
      streamsPending > 0 &&
      !syncInProgressRef.current &&
      !streamsSyncInProgressRef.current
    ) {
      // Clear any existing timeout
      if (streamsSyncTimeoutRef.current) {
        clearTimeout(streamsSyncTimeoutRef.current);
      }

      // Delay streams sync start to avoid overwhelming API
      streamsSyncTimeoutRef.current = setTimeout(() => {
        if (!streamsSyncInProgressRef.current && !syncInProgressRef.current) {
          startStreamsSync();
        }
        streamsSyncTimeoutRef.current = null;
      }, 2000);
    }
  }, [statusLoading, activityCount, streamsPending, startStreamsSync]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      syncInProgressRef.current = false;
      streamsSyncInProgressRef.current = false;
      if (streamsSyncTimeoutRef.current) {
        clearTimeout(streamsSyncTimeoutRef.current);
      }
    };
  }, []);

  return {
    // Status
    activityCount,
    latestActivityDate: syncStatus?.latestActivityDate ?? null,
    isLoading: statusLoading,
    error: statusError,

    // Sync state
    isSyncing: isSyncing || syncInProgress,

    // Streams sync status
    streamsProgress: syncStatus?.streams ?? null,
    isStreamsSyncing: isStreamsSyncing || streamsSyncInProgress,
    streamsComplete: syncStatus?.streams
      ? syncStatus.streams.pending === 0 && syncStatus.streams.total > 0
      : false,

    // Actions
    forceSync,
    stopSync,
    startStreamsSync,
    stopStreamsSync,
    refetchStatus,
  };
}
