import {
  Box,
  Flex,
  Text,
  SegmentedControl,
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
  PiBarbell,
  PiPersonSimpleSki,
  PiWaves,
  PiSneakerMove,
} from "react-icons/pi";
import { TbKayak, TbYoga, TbStretching } from "react-icons/tb";
import {
  GiGolfFlag,
  GiRollerSkate,
  GiStairsGoal,
  GiSurfBoard,
  GiSoccerBall,
  GiSnowboard,
} from "react-icons/gi";
import { LuSailboat } from "react-icons/lu";
import { FaSkating } from "react-icons/fa";
import { IndoorIcon } from "../icons/IndoorIcon";
import type { TimeSpan, MetricKey } from "../../lib/chart-utils";
import styles from "./ActivityCharts.module.css";
import {
  MdDirectionsBike,
  MdDirectionsRun,
  MdElectricBike,
} from "react-icons/md";

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

// Icon mapping for known sport types
const SPORT_TYPE_ICONS: Record<
  string,
  React.ComponentType<{ size?: number }>
> = {
  Run: MdDirectionsRun,
  VirtualRun: MdDirectionsRun,
  TrailRun: MdDirectionsRun,
  Ride: MdDirectionsBike,
  VirtualRide: MdDirectionsBike,
  GravelRide: MdDirectionsBike,
  MountainBikeRide: MdDirectionsBike,
  EBikeRide: MdElectricBike,
  IndoorRide: IndoorIcon,
  Swim: PiSwimmingPool,
  Walk: PiPersonSimpleWalk,
  Hike: PiMountains,
  Rowing: TbKayak, // Using kayak icon for rowing
  Kayaking: TbKayak,
  Canoeing: TbKayak,
  StandUpPaddling: PiWaves,
  Surfing: GiSurfBoard,
  Kitesurf: PiWaves, // Using waves icon for kitesurf
  Windsurf: GiSurfBoard,
  Sail: LuSailboat,
  AlpineSki: PiPersonSimpleSki,
  BackcountrySki: PiPersonSimpleSki,
  NordicSki: PiPersonSimpleSki,
  Snowboard: GiSnowboard,
  Snowshoe: PiPersonSimpleSki,
  IceSkate: FaSkating,
  InlineSkate: GiRollerSkate,
  RollerSki: GiRollerSkate,
  Skateboard: GiRollerSkate,
  WeightTraining: PiBarbell,
  Crossfit: PiBarbell,
  Workout: TbStretching,
  Yoga: TbYoga,
  RockClimbing: PiMountains,
  Golf: GiGolfFlag,
  Soccer: GiSoccerBall,
  StairStepper: GiStairsGoal,
  Elliptical: PiSneakerMove,
  Velomobile: MdDirectionsBike,
  Handcycle: MdDirectionsBike,
  Wheelchair: PiPersonSimpleWalk,
};

// Labels for sport types (use type name if not specified)
const SPORT_TYPE_LABELS: Record<string, string> = {
  VirtualRun: "Virtual Run",
  TrailRun: "Trail Run",
  VirtualRide: "Virtual Ride",
  GravelRide: "Gravel",
  MountainBikeRide: "MTB",
  EBikeRide: "E-Bike",
  IndoorRide: "Indoor Bike",
  StandUpPaddling: "SUP",
  AlpineSki: "Ski",
  BackcountrySki: "Backcountry Ski",
  NordicSki: "Nordic Ski",
  IceSkate: "Ice Skate",
  InlineSkate: "Inline Skate",
  RollerSki: "Roller Ski",
  WeightTraining: "Weights",
  RockClimbing: "Climbing",
  StairStepper: "Stairs",
};

// Get icon for a sport type (fallback to generic icon)
function getSportTypeIcon(
  sportType: string
): React.ComponentType<{ size?: number }> {
  return SPORT_TYPE_ICONS[sportType] || PiDotsThree;
}

// Get label for a sport type
function getSportTypeLabel(sportType: string): string {
  return SPORT_TYPE_LABELS[sportType] || sportType;
}

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
    <Flex direction="column" gap="4" className={styles.controlsContainer}>
      {/* Time Span Control */}
      <Box>
        <Text size="2" weight="medium" mb="2" as="p">
          Time Period
        </Text>
        <Flex align="center" gap="3" wrap="wrap">
          <div className={styles.segmentedControlWrapper}>
            <SegmentedControl.Root
              value={timeSpan}
              onValueChange={(value) => onTimeSpanChange(value as TimeSpan)}
              size="2"
            >
              <SegmentedControl.Item value="7d">7d</SegmentedControl.Item>
              <SegmentedControl.Item value="30d">30d</SegmentedControl.Item>
              <SegmentedControl.Item value="90d">90d</SegmentedControl.Item>
              <SegmentedControl.Item value="1y">1Y</SegmentedControl.Item>
              <SegmentedControl.Item value="ytd">YTD</SegmentedControl.Item>
              <SegmentedControl.Item value="all">All</SegmentedControl.Item>
            </SegmentedControl.Root>
          </div>

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
        <div className={styles.toggleCardsGrid}>
          {availableActivityTypes.map((sportType) => {
            const Icon = getSportTypeIcon(sportType);
            const isSelected = selectedActivityTypes.includes(sportType);

            return (
              <button
                type="button"
                key={sportType}
                onClick={() => toggleActivityType(sportType)}
                className={`${styles.toggleCard} ${
                  isSelected ? styles.toggleCardSelected : ""
                }`}
              >
                <Icon size={16} />
                <Text size="1" weight="medium">
                  {getSportTypeLabel(sportType)}
                </Text>
              </button>
            );
          })}
        </div>
      </Box>

      {/* Metrics */}
      <Box>
        <Text size="2" weight="medium" mb="2" as="p">
          Metrics
        </Text>
        <div className={styles.toggleCardsGrid}>
          {METRIC_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = selectedMetrics.includes(option.value);

            return (
              <button
                type="button"
                key={option.value}
                onClick={() => toggleMetric(option.value)}
                className={`${styles.toggleCard} ${
                  isSelected ? styles.toggleCardSelected : ""
                }`}
              >
                <Icon size={16} />
                <Text size="1" weight="medium">
                  {option.label}
                </Text>
              </button>
            );
          })}
        </div>
      </Box>
    </Flex>
  );
}
