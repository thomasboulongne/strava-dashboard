import type { Activity, ActivityType } from "./strava-types";

// Time span options
export type TimeSpan = "7d" | "30d" | "90d" | "ytd" | "all";

// Detect if a ride is an indoor ride (trainer, no GPS)
export function isIndoorRide(activity: Activity): boolean {
  // Already a virtual ride - handled separately
  if (activity.type === "VirtualRide") return false;

  // Only check for ride-type activities
  const rideTypes: ActivityType[] = ["Ride", "EBikeRide"];
  if (!rideTypes.includes(activity.type)) return false;

  // Check for indoor indicators:
  // 1. Trainer flag is set
  // 2. No GPS coordinates (start_latlng is null)
  // 3. No map polyline
  const hasTrainerFlag = activity.trainer === true;
  const noGps = activity.start_latlng === null;
  const noPolyline = !activity.map?.summary_polyline;

  return hasTrainerFlag || (noGps && noPolyline);
}

// Get the effective sport type for charting (distinguishes indoor rides)
export function getEffectiveSportType(activity: Activity): string {
  if (isIndoorRide(activity)) {
    return "IndoorRide";
  }
  return activity.sport_type || activity.type;
}

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

  // Create start from end to preserve month context
  start = new Date(end);
  start.setDate(start.getDate() - daysInSpan + 1);

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

  // Check if IndoorRide is selected (special handling)
  const includeIndoorRide = selectedTypes.includes("IndoorRide");
  // Check if Ride is selected (outdoor rides only when IndoorRide exists as option)
  const includeOutdoorRide = selectedTypes.includes("Ride");

  const allowedTypes = new Set<ActivityType>();
  selectedTypes.forEach((group) => {
    // Skip IndoorRide - handled specially
    if (group === "IndoorRide") return;
    ACTIVITY_TYPE_GROUPS[group]?.types.forEach((type) =>
      allowedTypes.add(type)
    );
  });

  return activities.filter((activity) => {
    // Special handling for ride activities
    if (isIndoorRide(activity)) {
      return includeIndoorRide;
    }

    // For outdoor rides (Ride, VirtualRide, EBikeRide that are not indoor)
    const rideTypes: ActivityType[] = ["Ride", "VirtualRide", "EBikeRide"];
    if (rideTypes.includes(activity.type)) {
      return includeOutdoorRide;
    }

    // For all other activity types, use the standard group matching
    return allowedTypes.has(activity.type);
  });
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
        type: getEffectiveSportType(a),
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
  let hasIndoorRide = false;
  let hasOutdoorRide = false;

  activities.forEach((activity) => {
    // Check for indoor/outdoor rides specifically
    if (isIndoorRide(activity)) {
      hasIndoorRide = true;
      return; // Don't add to regular Ride group
    }

    // Check if it's an outdoor ride
    const rideTypes: ActivityType[] = ["Ride", "VirtualRide", "EBikeRide"];
    if (rideTypes.includes(activity.type)) {
      hasOutdoorRide = true;
    }

    // Add to regular groups
    Object.entries(ACTIVITY_TYPE_GROUPS).forEach(([group, config]) => {
      if (config.types.includes(activity.type)) {
        types.add(group);
      }
    });
  });

  // Add IndoorRide if we have indoor rides
  if (hasIndoorRide) {
    types.add("IndoorRide");
  }

  // Only keep Ride if we have outdoor rides
  if (!hasOutdoorRide) {
    types.delete("Ride");
  }

  return Array.from(types);
}

// ============================================
// Advanced Chart Utilities
// ============================================

// Get ISO week string (YYYY-WW) for a date
export function getISOWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  // January 4 is always in week 1
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = Math.round(
    ((d.getTime() - week1.getTime()) / 86400000 -
      3 +
      ((week1.getDay() + 6) % 7)) /
      7 +
      1
  );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// Get the Monday of a given week
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

// Weekly volume data point for stacked bar chart
export interface WeeklyVolumeDataPoint {
  week: string;
  weekLabel: string;
  weekStart: string;
  // Totals across all sports
  totalTime: number; // hours
  totalDistance: number; // km
  totalElevation: number; // m
  // Per-sport breakdown for stacking
  bySport: Record<
    string,
    { time: number; distance: number; elevation: number }
  >;
}

// Bucket activities by ISO week with volume aggregations
export function bucketByWeekVolume(
  activities: Activity[],
  startDate: Date,
  endDate: Date
): WeeklyVolumeDataPoint[] {
  const weekMap = new Map<string, WeeklyVolumeDataPoint>();

  // Generate all weeks in range
  const current = getWeekStart(startDate);
  while (current <= endDate) {
    const weekKey = getISOWeekKey(current);
    const weekLabel = current.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    weekMap.set(weekKey, {
      week: weekKey,
      weekLabel,
      weekStart: formatLocalDate(current),
      totalTime: 0,
      totalDistance: 0,
      totalElevation: 0,
      bySport: {},
    });
    current.setDate(current.getDate() + 7);
  }

  // Aggregate activities
  activities.forEach((activity) => {
    const date = new Date(activity.start_date_local);
    const weekKey = getISOWeekKey(date);
    const point = weekMap.get(weekKey);
    if (!point) return;

    const sportType = getEffectiveSportType(activity);
    const hours = activity.moving_time / 3600;
    const km = activity.distance / 1000;
    const elev = activity.total_elevation_gain;

    point.totalTime += hours;
    point.totalDistance += km;
    point.totalElevation += elev;

    if (!point.bySport[sportType]) {
      point.bySport[sportType] = { time: 0, distance: 0, elevation: 0 };
    }
    point.bySport[sportType].time += hours;
    point.bySport[sportType].distance += km;
    point.bySport[sportType].elevation += elev;
  });

  return Array.from(weekMap.values()).sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart)
  );
}

// Daily activity data for heatmap
export interface DailyActivityData {
  date: string;
  minutes: number;
  intensityBin: 0 | 1 | 2 | 3 | 4; // 0=none, 1=1-30, 2=31-60, 3=61-120, 4=120+
}

// Bucket activities by day for heatmap
export function bucketByDay(
  activities: Activity[],
  startDate: Date,
  endDate: Date
): DailyActivityData[] {
  const dayMap = new Map<string, number>();

  // Generate all days in range
  const current = new Date(startDate);
  current.setHours(12, 0, 0, 0);
  while (current <= endDate) {
    dayMap.set(formatLocalDate(current), 0);
    current.setDate(current.getDate() + 1);
  }

  // Sum moving time per day
  activities.forEach((activity) => {
    const dateKey = formatLocalDate(new Date(activity.start_date_local));
    if (dayMap.has(dateKey)) {
      dayMap.set(dateKey, dayMap.get(dateKey)! + activity.moving_time / 60);
    }
  });

  return Array.from(dayMap.entries())
    .map(([date, minutes]) => ({
      date,
      minutes,
      intensityBin: getIntensityBin(minutes),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getIntensityBin(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes === 0) return 0;
  if (minutes <= 30) return 1;
  if (minutes <= 60) return 2;
  if (minutes <= 120) return 3;
  return 4;
}

// Weekly max ride data
export interface WeeklyMaxRideData {
  week: string;
  weekLabel: string;
  maxDurationHours: number;
  maxActivity: { id: number; name: string; date: string } | null;
}

// Get weekly max ride duration
export function getWeeklyMaxRides(
  activities: Activity[],
  startDate: Date,
  endDate: Date
): WeeklyMaxRideData[] {
  const weekMap = new Map<string, WeeklyMaxRideData>();

  // Generate all weeks
  const current = getWeekStart(startDate);
  while (current <= endDate) {
    const weekKey = getISOWeekKey(current);
    const weekLabel = current.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    weekMap.set(weekKey, {
      week: weekKey,
      weekLabel,
      maxDurationHours: 0,
      maxActivity: null,
    });
    current.setDate(current.getDate() + 7);
  }

  // Find max per week for Ride activities
  const rideTypes = new Set(ACTIVITY_TYPE_GROUPS.Ride.types);
  activities
    .filter((a) => rideTypes.has(a.type))
    .forEach((activity) => {
      const date = new Date(activity.start_date_local);
      const weekKey = getISOWeekKey(date);
      const point = weekMap.get(weekKey);
      if (!point) return;

      const hours = activity.moving_time / 3600;
      if (hours > point.maxDurationHours) {
        point.maxDurationHours = hours;
        point.maxActivity = {
          id: activity.id,
          name: activity.name,
          date: activity.start_date_local,
        };
      }
    });

  return Array.from(weekMap.values()).sort((a, b) =>
    a.week.localeCompare(b.week)
  );
}

// Duration histogram buckets
export const DURATION_BUCKETS = [
  { min: 0, max: 30, label: "0-30" },
  { min: 30, max: 60, label: "30-60" },
  { min: 60, max: 90, label: "60-90" },
  { min: 90, max: 120, label: "90-120" },
  { min: 120, max: 180, label: "120-180" },
  { min: 180, max: Infinity, label: "180+" },
] as const;

export interface DurationBucketData {
  bucket: string;
  count: number;
  activities: ActivityInfo[];
}

// Get duration distribution for Ride activities
export function getDurationDistribution(
  activities: Activity[]
): DurationBucketData[] {
  const rideTypes = new Set(ACTIVITY_TYPE_GROUPS.Ride.types);
  const rides = activities.filter((a) => rideTypes.has(a.type));

  const buckets: DurationBucketData[] = DURATION_BUCKETS.map((b) => ({
    bucket: b.label,
    count: 0,
    activities: [],
  }));

  rides.forEach((activity) => {
    const minutes = activity.moving_time / 60;
    const bucketIndex = DURATION_BUCKETS.findIndex(
      (b) => minutes >= b.min && minutes < b.max
    );
    if (bucketIndex !== -1) {
      buckets[bucketIndex].count++;
      buckets[bucketIndex].activities.push({
        id: activity.id,
        name: activity.name,
        type: getEffectiveSportType(activity),
      });
    }
  });

  return buckets;
}

// Pace/speed data point
export interface SpeedDataPoint {
  date: string;
  activityId: number;
  name: string;
  speedKph: number;
  durationMin: number;
}

// Get ride speeds over time
export function getRideSpeeds(
  activities: Activity[],
  minDurationMinutes: number = 20
): SpeedDataPoint[] {
  const rideTypes = new Set(ACTIVITY_TYPE_GROUPS.Ride.types);

  return activities
    .filter(
      (a) => rideTypes.has(a.type) && a.moving_time / 60 >= minDurationMinutes
    )
    .map((a) => ({
      date: formatLocalDate(new Date(a.start_date_local)),
      activityId: a.id,
      name: a.name,
      speedKph: a.distance / 1000 / (a.moving_time / 3600),
      durationMin: a.moving_time / 60,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Compute rolling median for speed trend
export function computeRollingMedian(
  data: SpeedDataPoint[],
  windowDays: number = 14
): Array<{ date: string; medianSpeed: number }> {
  if (data.length === 0) return [];

  const result: Array<{ date: string; medianSpeed: number }> = [];
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  // Get unique dates
  const uniqueDates = [...new Set(data.map((d) => d.date))].sort();

  uniqueDates.forEach((dateStr) => {
    const currentDate = new Date(dateStr + "T12:00:00").getTime();
    const windowStart = currentDate - windowMs;

    // Get all speeds in window
    const windowSpeeds = data
      .filter((d) => {
        const dTime = new Date(d.date + "T12:00:00").getTime();
        return dTime >= windowStart && dTime <= currentDate;
      })
      .map((d) => d.speedKph)
      .sort((a, b) => a - b);

    if (windowSpeeds.length > 0) {
      const mid = Math.floor(windowSpeeds.length / 2);
      const median =
        windowSpeeds.length % 2 === 0
          ? (windowSpeeds[mid - 1] + windowSpeeds[mid]) / 2
          : windowSpeeds[mid];
      result.push({ date: dateStr, medianSpeed: median });
    }
  });

  return result;
}

// Climbing focus data
export interface ClimbingFocusData {
  week: string;
  weekLabel: string;
  totalElevation: number; // m
  avgVerticalRate: number; // m/h
  rideCount: number;
}

// Get climbing focus data
export function getClimbingFocusData(
  activities: Activity[],
  startDate: Date,
  endDate: Date
): ClimbingFocusData[] {
  const weekMap = new Map<
    string,
    { elev: number; totalTime: number; count: number }
  >();

  // Generate weeks
  const current = getWeekStart(startDate);
  while (current <= endDate) {
    const weekKey = getISOWeekKey(current);
    weekMap.set(weekKey, { elev: 0, totalTime: 0, count: 0 });
    current.setDate(current.getDate() + 7);
  }

  // Aggregate rides
  const rideTypes = new Set(ACTIVITY_TYPE_GROUPS.Ride.types);
  activities
    .filter((a) => rideTypes.has(a.type))
    .forEach((activity) => {
      const date = new Date(activity.start_date_local);
      const weekKey = getISOWeekKey(date);
      const data = weekMap.get(weekKey);
      if (!data) return;

      data.elev += activity.total_elevation_gain;
      data.totalTime += activity.moving_time / 3600;
      data.count++;
    });

  const result: ClimbingFocusData[] = [];
  const weekCurrent = getWeekStart(startDate);
  while (weekCurrent <= endDate) {
    const weekKey = getISOWeekKey(weekCurrent);
    const weekLabel = weekCurrent.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const data = weekMap.get(weekKey)!;
    result.push({
      week: weekKey,
      weekLabel,
      totalElevation: data.elev,
      avgVerticalRate: data.totalTime > 0 ? data.elev / data.totalTime : 0,
      rideCount: data.count,
    });
    weekCurrent.setDate(weekCurrent.getDate() + 7);
  }

  return result;
}

// Acute/chronic load data
export interface LoadDataPoint {
  date: string;
  dailyLoad: number;
  acuteLoad: number; // 7-day sum
  chronicLoad: number; // 28-day sum
  rampRatio: number; // acute/chronic
}

// Sport weight factors for load calculation
export const SPORT_WEIGHTS: Record<string, number> = {
  Run: 1.2,
  Ride: 1.0,
  Swim: 0.8,
  default: 1.0,
};

// Compute training load data
export function computeTrainingLoad(
  activities: Activity[],
  startDate: Date,
  endDate: Date
): LoadDataPoint[] {
  // Build daily load map
  const dailyLoad = new Map<string, number>();

  // Generate all days
  const current = new Date(startDate);
  current.setHours(12, 0, 0, 0);
  while (current <= endDate) {
    dailyLoad.set(formatLocalDate(current), 0);
    current.setDate(current.getDate() + 1);
  }

  // Sum weighted load per day
  activities.forEach((activity) => {
    const dateKey = formatLocalDate(new Date(activity.start_date_local));
    if (!dailyLoad.has(dateKey)) return;

    const sportGroup = Object.entries(ACTIVITY_TYPE_GROUPS).find(([, config]) =>
      config.types.includes(activity.type)
    )?.[0];
    const weight =
      SPORT_WEIGHTS[sportGroup || "default"] || SPORT_WEIGHTS.default;
    const loadMinutes = (activity.moving_time / 60) * weight;

    dailyLoad.set(dateKey, dailyLoad.get(dateKey)! + loadMinutes);
  });

  // Convert to sorted array
  const sortedDays = Array.from(dailyLoad.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  // Compute rolling sums
  const result: LoadDataPoint[] = [];

  sortedDays.forEach(([date, load], index) => {
    // Acute load (7 days)
    let acuteSum = 0;
    for (let i = Math.max(0, index - 6); i <= index; i++) {
      acuteSum += sortedDays[i][1];
    }

    // Chronic load (28 days)
    let chronicSum = 0;
    for (let i = Math.max(0, index - 27); i <= index; i++) {
      chronicSum += sortedDays[i][1];
    }

    // Normalize chronic to 7-day average for fair comparison
    const chronicNormalized = (chronicSum / 28) * 7;

    result.push({
      date,
      dailyLoad: load,
      acuteLoad: acuteSum,
      chronicLoad: chronicNormalized,
      rampRatio: chronicNormalized > 0 ? acuteSum / chronicNormalized : 0,
    });
  });

  return result;
}

// Location cluster data
export interface LocationCluster {
  cellKey: string;
  lat: number;
  lng: number;
  count: number;
  totalDistanceKm: number;
  totalTimeHours: number;
  activities: Array<{ id: number; name: string; date: string }>;
}

// Cluster activities by start location
export function clusterByStartLocation(
  activities: Activity[],
  precision: number = 2
): LocationCluster[] {
  const clusterMap = new Map<string, LocationCluster>();

  activities.forEach((activity) => {
    if (!activity.start_latlng || activity.start_latlng.length !== 2) return;

    const [lat, lng] = activity.start_latlng;
    const roundedLat = Number(lat.toFixed(precision));
    const roundedLng = Number(lng.toFixed(precision));
    const cellKey = `${roundedLat},${roundedLng}`;

    if (!clusterMap.has(cellKey)) {
      clusterMap.set(cellKey, {
        cellKey,
        lat: roundedLat,
        lng: roundedLng,
        count: 0,
        totalDistanceKm: 0,
        totalTimeHours: 0,
        activities: [],
      });
    }

    const cluster = clusterMap.get(cellKey)!;
    cluster.count++;
    cluster.totalDistanceKm += activity.distance / 1000;
    cluster.totalTimeHours += activity.moving_time / 3600;
    cluster.activities.push({
      id: activity.id,
      name: activity.name,
      date: activity.start_date_local,
    });
  });

  return Array.from(clusterMap.values()).sort((a, b) => b.count - a.count);
}

// Export formatLocalDate for use in other modules
export { formatLocalDate };
