import { Flex, Text, Button, Spinner, Tooltip, Box } from "@radix-ui/themes";
import { FiRefreshCw, FiCheck, FiActivity, FiLayers } from "react-icons/fi";
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

interface LapsIndicatorProps {
  lapsProgress: {
    total: number;
    withLaps: number;
    pending: number;
  } | null;
  isLapsSyncing: boolean;
  lapsComplete: boolean;
  startLapsSync: () => void;
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

function LapsIndicator({
  lapsProgress,
  isLapsSyncing,
  lapsComplete,
  startLapsSync,
}: LapsIndicatorProps) {
  if (!lapsProgress || lapsProgress.total === 0) {
    return null;
  }

  const percent = Math.round(
    (lapsProgress.withLaps / lapsProgress.total) * 100
  );

  if (isLapsSyncing) {
    return (
      <Tooltip
        content={`Syncing laps: ${lapsProgress.withLaps}/${lapsProgress.total}`}
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

  if (!lapsComplete) {
    return (
      <Tooltip
        content={`${lapsProgress.pending} activities need laps sync`}
      >
        <Button size="1" variant="ghost" onClick={startLapsSync}>
          <FiLayers size={12} />
          <Text size="1">{percent}%</Text>
        </Button>
      </Tooltip>
    );
  }

  return (
    <Tooltip content="All laps synced">
      <Box>
        <FiLayers size={12} color="var(--green-9)" />
      </Box>
    </Tooltip>
  );
}

export function SyncStatus() {
  const {
    activityCount,
    isSyncing,
    forceSync,
    streamsProgress,
    isStreamsSyncing,
    streamsComplete,
    startStreamsSync,
    lapsProgress,
    isLapsSyncing,
    lapsComplete,
    startLapsSync,
  } = useSync();

  // Syncing in progress
  if (isSyncing) {
    return (
      <Flex align="center" gap="2">
        <Spinner size="1" />
        <Text size="2" color="gray">
          Syncing activities...
        </Text>
      </Flex>
    );
  }

  // Normal state - show activity count with refresh option
  return (
    <Flex align="center" gap="2">
      {activityCount > 0 ? <FiCheck size={14} color="var(--green-9)" /> : null}
      <Text size="2" color="gray">
        {activityCount} activities
      </Text>
      <StreamsIndicator
        streamsProgress={streamsProgress}
        isStreamsSyncing={isStreamsSyncing}
        streamsComplete={streamsComplete}
        startStreamsSync={startStreamsSync}
      />
      <LapsIndicator
        lapsProgress={lapsProgress}
        isLapsSyncing={isLapsSyncing}
        lapsComplete={lapsComplete}
        startLapsSync={startLapsSync}
      />
      <Tooltip content="Check for new activities">
        <Button
          size="1"
          variant="ghost"
          onClick={forceSync}
          disabled={isSyncing}
        >
          <FiRefreshCw size={12} />
        </Button>
      </Tooltip>
    </Flex>
  );
}
