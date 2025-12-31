import {
  Flex,
  Text,
  Badge,
  Button,
  Spinner,
  Tooltip,
  Box,
} from "@radix-ui/themes";
import {
  FiRefreshCw,
  FiCheck,
  FiAlertCircle,
  FiPause,
  FiActivity,
} from "react-icons/fi";
import { useSync } from "../hooks/useSync";

interface StreamsIndicatorProps {
  streamsProgress: {
    total: number;
    withStreams: number;
    pending: number;
  } | null;
  isStreamsSyncing: boolean;
  streamsComplete: boolean;
  startStreamsSync: () => void;
}

function StreamsIndicator({
  streamsProgress,
  isStreamsSyncing,
  streamsComplete,
  startStreamsSync,
}: StreamsIndicatorProps) {
  if (!streamsProgress || streamsProgress.total === 0) {
    return null;
  }

  const percent = Math.round(
    (streamsProgress.withStreams / streamsProgress.total) * 100
  );

  if (isStreamsSyncing) {
    return (
      <Tooltip
        content={`Syncing HR/Power data: ${streamsProgress.withStreams}/${streamsProgress.total}`}
      >
        <Flex align="center" gap="1">
          <Spinner size="1" />
          <Text size="1" color="gray">
            {percent}%
          </Text>
        </Flex>
      </Tooltip>
    );
  }

  if (!streamsComplete) {
    return (
      <Tooltip
        content={`${streamsProgress.pending} activities need HR/Power sync`}
      >
        <Button size="1" variant="ghost" onClick={startStreamsSync}>
          <FiActivity size={12} />
          <Text size="1">{percent}%</Text>
        </Button>
      </Tooltip>
    );
  }

  return (
    <Tooltip content="All HR/Power data synced">
      <Box>
        <FiActivity size={12} color="var(--green-9)" />
      </Box>
    </Tooltip>
  );
}

export function SyncStatus() {
  const {
    syncJob,
    activityCount,
    isSyncing,
    isComplete,
    isPaused,
    progress,
    forceSync,
    streamsProgress,
    isStreamsSyncing,
    streamsComplete,
    startStreamsSync,
  } = useSync();

  // No sync job at all - show activities with refresh option
  if (!syncJob) {
    return (
      <Flex align="center" gap="2">
        {activityCount > 0 ? (
          <FiCheck size={14} color="var(--green-9)" />
        ) : null}
        <Text size="2" color="gray">
          {activityCount} activities
        </Text>
        <StreamsIndicator
          streamsProgress={streamsProgress}
          isStreamsSyncing={isStreamsSyncing}
          streamsComplete={streamsComplete}
          startStreamsSync={startStreamsSync}
        />
        <Button
          size="1"
          variant="ghost"
          onClick={forceSync}
          title="Sync activities from Strava"
        >
          <FiRefreshCw size={12} />
        </Button>
      </Flex>
    );
  }

  // Activity sync in progress
  if (isSyncing) {
    return (
      <Flex align="center" gap="2">
        <Spinner size="1" />
        <Text size="2" color="gray">
          Syncing... {progress?.totalSynced ?? 0} activities
        </Text>
        <Badge color="blue" size="1">
          In Progress
        </Badge>
      </Flex>
    );
  }

  // Sync paused (rate limited)
  if (isPaused) {
    return (
      <Flex align="center" gap="2">
        <FiPause size={14} />
        <Text size="2" color="amber">
          Sync paused ({progress?.totalSynced ?? 0} synced)
        </Text>
        <Badge color="amber" size="1">
          Rate Limited
        </Badge>
        <Button size="1" variant="ghost" onClick={forceSync}>
          <FiRefreshCw size={12} />
          Resume
        </Button>
      </Flex>
    );
  }

  // Sync failed
  if (syncJob.status === "failed") {
    return (
      <Flex align="center" gap="2">
        <FiAlertCircle size={14} color="var(--red-9)" />
        <Text size="2" color="red">
          Sync failed
        </Text>
        <Badge color="red" size="1">
          Error
        </Badge>
        <Button size="1" variant="ghost" onClick={forceSync}>
          <FiRefreshCw size={12} />
          Retry
        </Button>
      </Flex>
    );
  }

  // Activity sync complete
  if (isComplete) {
    return (
      <Flex align="center" gap="2">
        <FiCheck size={14} color="var(--green-9)" />
        <Text size="2" color="gray">
          {activityCount} activities
        </Text>
        <StreamsIndicator
          streamsProgress={streamsProgress}
          isStreamsSyncing={isStreamsSyncing}
          streamsComplete={streamsComplete}
          startStreamsSync={startStreamsSync}
        />
        <Button
          size="1"
          variant="ghost"
          onClick={forceSync}
          title="Refresh activities"
        >
          <FiRefreshCw size={12} />
        </Button>
      </Flex>
    );
  }

  // Default state
  return (
    <Flex align="center" gap="2">
      <Text size="2" color="gray">
        {activityCount} activities
      </Text>
      <StreamsIndicator
        streamsProgress={streamsProgress}
        isStreamsSyncing={isStreamsSyncing}
        streamsComplete={streamsComplete}
        startStreamsSync={startStreamsSync}
      />
    </Flex>
  );
}
