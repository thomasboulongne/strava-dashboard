import {
  Box,
  Flex,
  Text,
  SegmentedControl,
  RadioCards,
  IconButton,
} from "@radix-ui/themes";
import {
  PiSwimmingPool,
  PiPersonSimpleWalk,
  PiMountains,
  PiDotsThree,
  PiRuler,
  PiTimer,
  PiTrendUp,
  PiGauge,
  PiHeartbeat,
  PiCaretLeft,
  PiCaretRight,
} from "react-icons/pi";
import { IndoorIcon } from "../icons/IndoorIcon";
import type { TimeSpan, MetricKey } from "../../lib/chart-utils";
import styles from "./ActivityCharts.module.css";
import { MdDirectionsBike, MdDirectionsRun } from "react-icons/md";

interface ChartControlsProps {
  timeSpan: TimeSpan;
  onTimeSpanChange: (value: TimeSpan) => void;
  selectedActivityTypes: string[];
  onActivityTypesChange: (types: string[]) => void;
  selectedMetrics: MetricKey[];
  onMetricsChange: (metrics: MetricKey[]) => void;
  availableActivityTypes: string[];
  page: number;
  onPageChange: (page: number) => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}

// Activity type options with icons
const ACTIVITY_TYPE_OPTIONS = [
  { value: "Run", label: "Run", icon: MdDirectionsRun },
  { value: "Ride", label: "Ride", icon: MdDirectionsBike },
  { value: "IndoorRide", label: "Indoor", icon: IndoorIcon },
  { value: "Swim", label: "Swim", icon: PiSwimmingPool },
  { value: "Walk", label: "Walk", icon: PiPersonSimpleWalk },
  { value: "Hike", label: "Hike", icon: PiMountains },
  { value: "Other", label: "Other", icon: PiDotsThree },
];

// Metric options with icons
const METRIC_OPTIONS: {
  value: MetricKey;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}[] = [
  { value: "distance", label: "Distance", icon: PiRuler },
  { value: "moving_time", label: "Duration", icon: PiTimer },
  { value: "total_elevation_gain", label: "Elevation", icon: PiTrendUp },
  { value: "average_speed", label: "Speed", icon: PiGauge },
  { value: "average_heartrate", label: "Heart Rate", icon: PiHeartbeat },
];

export function ChartControls({
  timeSpan,
  onTimeSpanChange,
  selectedActivityTypes,
  onActivityTypesChange,
  selectedMetrics,
  onMetricsChange,
  availableActivityTypes,
  page,
  onPageChange,
  canGoNext,
  canGoPrev,
}: ChartControlsProps) {
  // Toggle activity type in selection
  const toggleActivityType = (type: string) => {
    if (selectedActivityTypes.includes(type)) {
      onActivityTypesChange(selectedActivityTypes.filter((t) => t !== type));
    } else {
      onActivityTypesChange([...selectedActivityTypes, type]);
    }
  };

  // Toggle metric in selection
  const toggleMetric = (metric: MetricKey) => {
    if (selectedMetrics.includes(metric)) {
      // Don't allow deselecting if it's the only one
      if (selectedMetrics.length > 1) {
        onMetricsChange(selectedMetrics.filter((m) => m !== metric));
      }
    } else {
      onMetricsChange([...selectedMetrics, metric]);
    }
  };

  return (
    <Flex direction="column" gap="5">
      {/* Time Span Control */}
      <Box>
        <Text size="2" weight="medium" mb="2" as="p">
          Time Period
        </Text>
        <Flex align="center" gap="3">
          <SegmentedControl.Root
            value={timeSpan}
            onValueChange={(value) => onTimeSpanChange(value as TimeSpan)}
            size="2"
          >
            <SegmentedControl.Item value="7d">7 Days</SegmentedControl.Item>
            <SegmentedControl.Item value="30d">30 Days</SegmentedControl.Item>
            <SegmentedControl.Item value="90d">90 Days</SegmentedControl.Item>
            <SegmentedControl.Item value="ytd">Year</SegmentedControl.Item>
            <SegmentedControl.Item value="all">All</SegmentedControl.Item>
          </SegmentedControl.Root>

          {/* Pagination */}
          {timeSpan !== "all" && (
            <Flex align="center" gap="1">
              <IconButton
                variant="soft"
                size="2"
                disabled={!canGoPrev}
                onClick={() => onPageChange(page + 1)}
                aria-label="Previous period"
              >
                <PiCaretLeft size={16} />
              </IconButton>
              <IconButton
                variant="soft"
                size="2"
                disabled={!canGoNext}
                onClick={() => onPageChange(page - 1)}
                aria-label="Next period"
              >
                <PiCaretRight size={16} />
              </IconButton>
            </Flex>
          )}
        </Flex>
      </Box>

      {/* Activity Types */}
      <Box>
        <Text size="2" weight="medium" mb="2" as="p">
          Activity Types
        </Text>
        <RadioCards.Root
          className={styles.radioCardsGrid}
          columns={{ initial: "3", sm: "6" }}
          gap="2"
        >
          {ACTIVITY_TYPE_OPTIONS.filter((option) =>
            availableActivityTypes.includes(option.value)
          ).map((option) => {
            const Icon = option.icon;
            const isSelected = selectedActivityTypes.includes(option.value);

            return (
              <Box
                key={option.value}
                onClick={() => toggleActivityType(option.value)}
                className={`${styles.toggleCard} ${
                  isSelected ? styles.toggleCardSelected : ""
                }`}
              >
                <Flex direction="column" align="center" gap="1" p="3">
                  <Icon size={24} />
                  <Text size="1" weight="medium">
                    {option.label}
                  </Text>
                </Flex>
              </Box>
            );
          })}
        </RadioCards.Root>
      </Box>

      {/* Metrics */}
      <Box>
        <Text size="2" weight="medium" mb="2" as="p">
          Metrics
        </Text>
        <RadioCards.Root
          className={styles.radioCardsGrid}
          columns={{ initial: "3", sm: "5" }}
          gap="2"
        >
          {METRIC_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = selectedMetrics.includes(option.value);

            return (
              <Box
                key={option.value}
                onClick={() => toggleMetric(option.value)}
                className={`${styles.toggleCard} ${
                  isSelected ? styles.toggleCardSelected : ""
                }`}
              >
                <Flex direction="column" align="center" gap="1" p="3">
                  <Icon size={24} />
                  <Text size="1" weight="medium">
                    {option.label}
                  </Text>
                </Flex>
              </Box>
            );
          })}
        </RadioCards.Root>
      </Box>
    </Flex>
  );
}
