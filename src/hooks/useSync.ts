import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import {
  getSyncStatus,
  triggerSync,
  triggerStreamsSync,
  type SyncStatusResponse,
  type SyncTriggerResponse,
  type StreamsSyncTriggerResponse,
} from "../lib/api";

// Polling interval for sync status (2 seconds while syncing)
const SYNC_POLL_INTERVAL = 2000;
// Polling interval when sync is complete (30 seconds for occasional checks)
const IDLE_POLL_INTERVAL = 30000;

export function useSync() {
  const queryClient = useQueryClient();
  const syncInProgressRef = useRef(false);
  const streamsSyncInProgressRef = useRef(false);

  // Query for sync status
  const {
    data: syncStatus,
    isLoading: statusLoading,
    error: statusError,
    refetch: refetchStatus,
  } = useQuery<SyncStatusResponse>({
    queryKey: ["syncStatus"],
    queryFn: getSyncStatus,
    // Poll more frequently while sync is in progress
    refetchInterval: (query) => {
      const data = query.state.data;
      const status = data?.syncJob?.status;
      if (status === "in_progress" || status === "pending") {
        return SYNC_POLL_INTERVAL;
      }
      return IDLE_POLL_INTERVAL;
    },
    staleTime: 1000,
  });

  // Mutation to trigger/continue activity sync
  const {
    mutate: triggerSyncMutation,
    isPending: isSyncing,
  } = useMutation<SyncTriggerResponse>({
    mutationFn: triggerSync,
    onSuccess: (data) => {
      // Invalidate activities cache when sync makes progress
      if (data.totalSynced && data.totalSynced > 0) {
        queryClient.invalidateQueries({ queryKey: ["activities"] });
      }

      // Refetch status
      refetchStatus();

      // If sync is still in progress and has more, trigger another batch
      if (data.status === "in_progress" && data.hasMore) {
        syncInProgressRef.current = true;
        // Small delay before next batch to avoid hammering the API
        setTimeout(() => {
          if (syncInProgressRef.current) {
            triggerSyncMutation();
          }
        }, 500);
      } else {
        syncInProgressRef.current = false;
      }
    },
    onError: () => {
      syncInProgressRef.current = false;
    },
  });

  // Mutation to trigger/continue streams sync
  const {
    mutate: triggerStreamsSyncMutation,
    isPending: isStreamsSyncing,
  } = useMutation<StreamsSyncTriggerResponse>({
    mutationFn: triggerStreamsSync,
    onSuccess: (data) => {
      // Refetch status
      refetchStatus();

      // If streams sync is still in progress and has more, trigger another batch
      if (data.status === "in_progress" && data.hasMore) {
        streamsSyncInProgressRef.current = true;
        // Longer delay for streams to avoid rate limits (each activity = 1 API call)
        setTimeout(() => {
          if (streamsSyncInProgressRef.current) {
            triggerStreamsSyncMutation();
          }
        }, 1000);
      } else {
        streamsSyncInProgressRef.current = false;
      }
    },
    onError: () => {
      streamsSyncInProgressRef.current = false;
    },
  });

  // Start activity sync if there's a pending or paused job
  const startSync = useCallback(() => {
    if (syncInProgressRef.current) return;

    const status = syncStatus?.syncJob?.status;
    if (status === "pending" || status === "paused" || status === "in_progress") {
      syncInProgressRef.current = true;
      triggerSyncMutation();
    }
  }, [syncStatus?.syncJob?.status, triggerSyncMutation]);

  // Manually trigger a new activity sync
  const forceSync = useCallback(() => {
    syncInProgressRef.current = true;
    triggerSyncMutation();
  }, [triggerSyncMutation]);

  // Stop ongoing activity sync
  const stopSync = useCallback(() => {
    syncInProgressRef.current = false;
  }, []);

  // Start streams sync
  const startStreamsSync = useCallback(() => {
    if (streamsSyncInProgressRef.current) return;
    streamsSyncInProgressRef.current = true;
    triggerStreamsSyncMutation();
  }, [triggerStreamsSyncMutation]);

  // Stop streams sync
  const stopStreamsSync = useCallback(() => {
    streamsSyncInProgressRef.current = false;
  }, []);

  // Auto-start sync if there's a pending job
  useEffect(() => {
    if (!statusLoading && syncStatus?.syncJob) {
      const status = syncStatus.syncJob.status;
      if (status === "pending" || status === "in_progress") {
        startSync();
      }
    }
  }, [statusLoading, syncStatus?.syncJob, startSync]);

  // Auto-start streams sync after activity sync is complete if there are pending streams
  // Also start if there's no sync job but activities exist (e.g., webhook-synced activities)
  useEffect(() => {
    const activitySyncComplete =
      syncStatus?.syncJob?.status === "completed" ||
      (!syncStatus?.syncJob && (syncStatus?.activityCount ?? 0) > 0);

    if (
      !statusLoading &&
      activitySyncComplete &&
      syncStatus?.streams?.pending &&
      syncStatus.streams.pending > 0 &&
      !streamsSyncInProgressRef.current
    ) {
      // Delay streams sync start to avoid overwhelming API
      setTimeout(() => {
        if (!streamsSyncInProgressRef.current) {
          startStreamsSync();
        }
      }, 2000);
    }
  }, [
    statusLoading,
    syncStatus?.syncJob?.status,
    syncStatus?.syncJob,
    syncStatus?.activityCount,
    syncStatus?.streams?.pending,
    startStreamsSync,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      syncInProgressRef.current = false;
      streamsSyncInProgressRef.current = false;
    };
  }, []);

  return {
    // Status
    syncJob: syncStatus?.syncJob ?? null,
    activityCount: syncStatus?.activityCount ?? 0,
    isLoading: statusLoading,
    error: statusError,

    // Derived state for activities
    isSyncing: isSyncing || syncStatus?.syncJob?.status === "in_progress",
    isComplete: syncStatus?.syncJob?.status === "completed",
    isPaused: syncStatus?.syncJob?.status === "paused",
    hasPendingSync: syncStatus?.syncJob?.status === "pending",

    // Streams sync status
    streamsProgress: syncStatus?.streams ?? null,
    isStreamsSyncing: isStreamsSyncing || streamsSyncInProgressRef.current,
    // Only show as complete if we have loaded the status and there are no pending streams
    streamsComplete: syncStatus?.streams
      ? syncStatus.streams.pending === 0 && syncStatus.streams.total > 0
      : false,

    // Progress
    progress: syncStatus?.syncJob ? {
      currentPage: syncStatus.syncJob.currentPage,
      totalSynced: syncStatus.syncJob.totalActivitiesSynced,
    } : null,

    // Actions
    startSync,
    forceSync,
    stopSync,
    startStreamsSync,
    stopStreamsSync,
    refetchStatus,
  };
}

