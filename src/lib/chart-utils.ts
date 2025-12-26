import type { Activity, ActivityType } from "./strava-types";

// Time span options
export type TimeSpan = "7d" | "30d" | "90d" | "ytd" | "all";

// Metric types
export type MetricKey =
  | "distance"
  | "moving_time"
  | "total_elevation_gain"
  | "average_speed"
  | "average_heartrate";

export interface MetricConfig {
  key: MetricKey;
  label: string;
  unit: string;
  color: string;
  format: (value: number) => string;
}

// Metric configurations with colors and formatters
export const METRICS: Record<MetricKey, MetricConfig> = {
  distance: {
    key: "distance",
    label: "Distance",
    unit: "km",
    color: "#22c55e", // green
    format: (v) => (v / 1000).toFixed(1),
  },
  moving_time: {
    key: "moving_time",
    label: "Duration",
    unit: "min",
    color: "#3b82f6", // blue
    format: (v) => Math.round(v / 60).toString(),
  },
  total_elevation_gain: {
    key: "total_elevation_gain",
    label: "Elevation",
    unit: "m",
    color: "#f59e0b", // amber
    format: (v) => Math.round(v).toString(),
  },
  average_speed: {
    key: "average_speed",
    label: "Speed",
    unit: "km/h",
    color: "#8b5cf6", // purple
    format: (v) => (v * 3.6).toFixed(1), // m/s to km/h
  },
  average_heartrate: {
    key: "average_heartrate",
    label: "Heart Rate",
    unit: "bpm",
    color: "#ef4444", // red
    format: (v) => Math.round(v).toString(),
  },
};

// Activity type groups for filtering
export const ACTIVITY_TYPE_GROUPS: Record<
  string,
  { label: string; types: ActivityType[] }
> = {
  Run: {
    label: "Run",
    types: ["Run", "VirtualRun"],
  },
  Ride: {
    label: "Ride",
    types: ["Ride", "VirtualRide", "EBikeRide"],
  },
  Swim: {
    label: "Swim",
    types: ["Swim"],
  },
  Walk: {
    label: "Walk",
    types: ["Walk"],
  },
  Hike: {
    label: "Hike",
    types: ["Hike"],
  },
  Other: {
    label: "Other",
    types: [
      "AlpineSki",
      "BackcountrySki",
      "Canoeing",
      "Crossfit",
      "Elliptical",
      "Golf",
      "Handcycle",
      "IceSkate",
      "InlineSkate",
      "Kayaking",
      "Kitesurf",
      "NordicSki",
      "RockClimbing",
      "RollerSki",
      "Rowing",
      "Sail",
      "Skateboard",
      "Snowboard",
      "Snowshoe",
      "Soccer",
      "StairStepper",
      "StandUpPaddling",
      "Surfing",
      "Velomobile",
      "Walk",
      "WeightTraining",
      "Wheelchair",
      "Windsurf",
      "Workout",
      "Yoga",
    ],
  },
};

// Get date range based on time span and page
export function getDateRange(
  timeSpan: TimeSpan,
  page: number = 0,
  earliestActivityDate?: Date
): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now);

  // Calculate days based on time span
  let daysInSpan: number;

  switch (timeSpan) {
    case "7d":
      daysInSpan = 7;
      break;
    case "30d":
      daysInSpan = 30;
      break;
    case "90d":
      daysInSpan = 90;
      break;
    case "ytd":
      // Year to date - from Jan 1 of current year
      start = new Date(now.getFullYear(), 0, 1);
      if (page > 0) {
        // Go back full years for pagination
        start.setFullYear(start.getFullYear() - page);
        end.setFullYear(end.getFullYear() - page);
        end.setMonth(11);
        end.setDate(31);
      }
      return { start, end };
    case "all":
      // All time - start from earliest activity or default to 1 year ago
      if (earliestActivityDate) {
        start = new Date(earliestActivityDate);
      } else {
        start = new Date(now);
        start.setFullYear(start.getFullYear() - 1);
      }
      start.setHours(0, 0, 0, 0);
      return { start, end };
    default:
      daysInSpan = 30;
  }

  // Apply pagination offset
  const offset = page * daysInSpan;
  end.setDate(end.getDate() - offset);
  start.setDate(end.getDate() - daysInSpan + 1);

  // Reset time to start/end of day
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

// Filter activities by type groups
export function filterActivitiesByType(
  activities: Activity[],
  selectedTypes: string[]
): Activity[] {
  if (selectedTypes.length === 0) return activities;

  const allowedTypes = new Set<ActivityType>();
  selectedTypes.forEach((group) => {
    ACTIVITY_TYPE_GROUPS[group]?.types.forEach((type) =>
      allowedTypes.add(type)
    );
  });

  return activities.filter((activity) => allowedTypes.has(activity.type));
}

// Filter activities by date range
export function filterActivitiesByDateRange(
  activities: Activity[],
  start: Date,
  end: Date
): Activity[] {
  return activities.filter((activity) => {
    const activityDate = new Date(activity.start_date_local);
    return activityDate >= start && activityDate <= end;
  });
}

// Activity info for tooltip
export interface ActivityInfo {
  id: number;
  name: string;
  type: string;
}

// Chart data point
export interface ChartDataPoint {
  date: string;
  dateLabel: string;
  activities: ActivityInfo[];
  [key: string]: number | string | ActivityInfo[];
}

// Format date to YYYY-MM-DD using local time (not UTC)
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Get the date key for a given date based on aggregation mode
function getDateKey(date: Date, aggregateByWeek: boolean): string {
  if (aggregateByWeek) {
    // Get week start (Monday)
    const weekStart = new Date(date);
    weekStart.setHours(0, 0, 0, 0);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diff);
    return formatLocalDate(weekStart);
  }
  return formatLocalDate(date);
}

// Generate all date keys between start and end
function generateAllDateKeys(
  start: Date,
  end: Date,
  aggregateByWeek: boolean
): string[] {
  const keys: string[] = [];
  const current = new Date(start);

  // Normalize to start of day in local time
  current.setHours(12, 0, 0, 0); // Use noon to avoid DST issues

  // If aggregating by week, start from Monday
  if (aggregateByWeek) {
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1);
    current.setDate(diff);
  }

  const endTime = end.getTime();
  const seenKeys = new Set<string>();

  while (current.getTime() <= endTime) {
    const key = formatLocalDate(current);
    if (!seenKeys.has(key)) {
      keys.push(key);
      seenKeys.add(key);
    }

    if (aggregateByWeek) {
      current.setDate(current.getDate() + 7);
    } else {
      current.setDate(current.getDate() + 1);
    }
  }

  return keys;
}

// Aggregate activities by date for charting
export function aggregateActivitiesByDate(
  activities: Activity[],
  metrics: MetricKey[],
  timeSpan: TimeSpan,
  startDate: Date,
  endDate: Date
): ChartDataPoint[] {
  // Determine aggregation granularity
  const aggregateByWeek = timeSpan === "ytd" || timeSpan === "all";

  // Generate all date keys in range (including days with no activities)
  const allDateKeys = generateAllDateKeys(startDate, endDate, aggregateByWeek);

  // Group activities by date key
  const grouped = new Map<string, Activity[]>();

  // Initialize all keys with empty arrays
  allDateKeys.forEach((key) => {
    grouped.set(key, []);
  });

  // Add activities to their respective date keys
  activities.forEach((activity) => {
    const date = new Date(activity.start_date_local);
    const key = getDateKey(date, aggregateByWeek);

    if (grouped.has(key)) {
      grouped.get(key)!.push(activity);
    }
  });

  // Convert to chart data points in chronological order
  const dataPoints: ChartDataPoint[] = allDateKeys.map((dateKey) => {
    const dayActivities = grouped.get(dateKey) || [];
    // Parse date key as local date (add T12:00 to avoid timezone issues)
    const date = new Date(dateKey + "T12:00:00");
    const point: ChartDataPoint = {
      date: dateKey,
      dateLabel: formatDateLabel(date, aggregateByWeek),
      activities: dayActivities.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
      })),
    };

    // Aggregate each metric
    metrics.forEach((metric) => {
      let total = 0;
      let count = 0;

      dayActivities.forEach((activity) => {
        const value = activity[metric];
        if (typeof value === "number" && !isNaN(value)) {
          // For rate metrics (speed, heart rate), we average; for totals, we sum
          if (metric === "average_speed" || metric === "average_heartrate") {
            total += value;
            count++;
          } else {
            total += value;
          }
        }
      });

      // Store the aggregated value (0 for days with no activities)
      if (metric === "average_speed" || metric === "average_heartrate") {
        point[metric] = count > 0 ? total / count : 0;
      } else {
        point[metric] = total;
      }
    });

    return point;
  });

  return dataPoints;
}

// Format date label for chart axis
function formatDateLabel(date: Date, isWeek: boolean): string {
  const options: Intl.DateTimeFormatOptions = isWeek
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric" };

  return date.toLocaleDateString("en-US", options);
}

// Format tooltip value with unit
export function formatMetricValue(value: number, metric: MetricKey): string {
  const config = METRICS[metric];
  return `${config.format(value)} ${config.unit}`;
}

// Get unique activity types from activities
export function getUniqueActivityTypeGroups(activities: Activity[]): string[] {
  const types = new Set<string>();

  activities.forEach((activity) => {
    Object.entries(ACTIVITY_TYPE_GROUPS).forEach(([group, config]) => {
      if (config.types.includes(activity.type)) {
        types.add(group);
      }
    });
  });

  return Array.from(types);
}
