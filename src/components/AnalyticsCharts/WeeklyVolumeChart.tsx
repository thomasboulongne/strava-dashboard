import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { ChartCard } from "./ChartCard";
import chartStyles from "./ChartCard.module.css";
import { bucketByWeekVolume } from "../../lib/chart-utils";
import type { Activity } from "../../lib/strava-types";

// Comprehensive sport colors for stacked bars - each sport type gets a unique color
const SPORT_COLORS: Record<string, string> = {
  // Cycling variants - orange/amber family
  Ride: "#f97316",
  VirtualRide: "#c2410c",
  IndoorRide: "#fbbf24",
  EBikeRide: "#d97706",
  GravelRide: "#b45309",
  MountainBikeRide: "#92400e",
  Velomobile: "#ea580c",
  Handcycle: "#fdba74",

  // Running variants - green family
  Run: "#22c55e",
  VirtualRun: "#15803d",
  TrailRun: "#166534",

  // Water sports - blue family
  Swim: "#3b82f6",
  Rowing: "#0ea5e9",
  Kayaking: "#06b6d4",
  Canoeing: "#0891b2",
  StandUpPaddling: "#0284c7",
  Surfing: "#38bdf8",
  Kitesurf: "#7dd3fc",
  Windsurf: "#0369a1",
  Sail: "#1d4ed8",

  // Walking/hiking - purple/pink family
  Walk: "#a855f7",
  Hike: "#ec4899",

  // Winter sports - cyan/teal family
  AlpineSki: "#14b8a6",
  BackcountrySki: "#0d9488",
  NordicSki: "#2dd4bf",
  Snowboard: "#5eead4",
  Snowshoe: "#99f6e4",
  IceSkate: "#67e8f9",

  // Skating/wheeled - indigo family
  InlineSkate: "#6366f1",
  RollerSki: "#818cf8",
  Skateboard: "#a5b4fc",

  // Fitness/gym - red/rose family
  WeightTraining: "#ef4444",
  Crossfit: "#dc2626",
  Workout: "#f87171",
  Yoga: "#fb7185",
  Elliptical: "#fda4af",
  StairStepper: "#e11d48",

  // Other sports - varied
  RockClimbing: "#84cc16",
  Golf: "#65a30d",
  Soccer: "#4ade80",
  Wheelchair: "#9333ea",
};

// Generate a color for unknown sport types based on hash
function generateColorFromString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Use HSL to ensure good saturation and lightness
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 55%)`;
}

// Get color for a sport, ensuring unique colors for unknown types
function getSportColor(sport: string, usedColors: Set<string>): string {
  // If we have a predefined color, use it
  if (SPORT_COLORS[sport]) {
    return SPORT_COLORS[sport];
  }

  // Generate a color for unknown sport types
  let color = generateColorFromString(sport);

  // If the generated color is too similar to an already used one, shift the hue
  let attempts = 0;
  while (usedColors.has(color) && attempts < 36) {
    const hue = (parseInt(color.match(/\d+/)?.[0] || "0") + 30) % 360;
    color = `hsl(${hue}, 65%, 55%)`;
    attempts++;
  }

  return color;
}

type MetricMode = "time" | "distance" | "elevation" | "calories";

const metricConfig = {
  time: { label: "Hours", unit: "h", key: "time" as const },
  distance: { label: "Distance", unit: "km", key: "distance" as const },
  elevation: { label: "Elevation", unit: "m", key: "elevation" as const },
  calories: { label: "Calories", unit: "kcal", key: "calories" as const },
};

function formatMetricTotal(value: number, mode: MetricMode): string {
  if (mode === "calories") return Math.round(value).toLocaleString();
  return value.toFixed(1);
}

function formatYAxis(value: number, mode: MetricMode): string {
  if (mode === "time") return `${value}h`;
  if (mode === "calories") return value >= 1000 ? `${(value / 1000).toFixed(0)}k` : `${value}`;
  return `${value}`;
}

// Inner component to use hooks properly
function WeeklyVolumeContent({
  filteredActivities,
  startDate,
  endDate,
  metricMode,
}: {
  filteredActivities: Activity[];
  startDate: Date;
  endDate: Date;
  metricMode: MetricMode;
}) {
  const data = useMemo(
    () => bucketByWeekVolume(filteredActivities, startDate, endDate),
    [filteredActivities, startDate, endDate]
  );

  // Get all sports and assign unique colors
  const { allSports, sportColorMap } = useMemo(() => {
    const sports = new Set<string>();
    data.forEach((week) => {
      Object.keys(week.bySport).forEach((sport) => sports.add(sport));
    });
    const sportsList = Array.from(sports);

    // Build color map ensuring no duplicates
    const usedColors = new Set<string>();
    const colorMap: Record<string, string> = {};

    sportsList.forEach((sport) => {
      const color = getSportColor(sport, usedColors);
      colorMap[sport] = color;
      usedColors.add(color);
    });

    return { allSports: sportsList, sportColorMap: colorMap };
  }, [data]);

  const chartData = useMemo(() => {
    return data.map((week) => {
      const point: Record<string, number | string> = {
        week: week.weekLabel,
        weekKey: week.week,
        weekRange: week.weekRange,
      };
      allSports.forEach((sport) => {
        const sportData = week.bySport[sport];
        if (sportData) {
          const raw = sportData[metricConfig[metricMode].key];
          point[sport] = metricMode === "calories" ? Math.round(raw) : Number(raw.toFixed(2));
        } else {
          point[sport] = 0;
        }
      });
      return point;
    });
  }, [data, allSports, metricMode]);

  // Summary stats for calories mode
  const calorieSummary = useMemo(() => {
    if (metricMode !== "calories") return null;
    const totalCal = data.reduce((sum, w) => sum + w.totalCalories, 0);
    const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const weeks = data.length;
    return {
      total: totalCal,
      avgPerDay: totalCal / days,
      avgPerWeek: weeks > 0 ? totalCal / weeks : 0,
    };
  }, [data, metricMode, startDate, endDate]);

  if (data.length === 0) {
    return <div className={chartStyles.emptyState}>No activities found</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      {calorieSummary && calorieSummary.total > 0 && (
        <div style={{
          display: "flex",
          gap: "1rem",
          marginBottom: "0.5rem",
          flexWrap: "wrap",
          flexShrink: 0,
        }}>
          {[
            { label: "Total", value: `${Math.round(calorieSummary.total).toLocaleString()} kcal` },
            { label: "Avg / day", value: `${Math.round(calorieSummary.avgPerDay).toLocaleString()} kcal` },
            { label: "Avg / week", value: `${Math.round(calorieSummary.avgPerWeek).toLocaleString()} kcal` },
          ].map((stat) => (
            <div key={stat.label} style={{
              flex: "1 1 0",
              minWidth: "80px",
              padding: "0.375rem 0.625rem",
              background: "var(--gray-a3)",
              borderRadius: "var(--radius-2)",
              textAlign: "center",
            }}>
              <div style={{ fontSize: "0.625rem", color: "var(--gray-10)", marginBottom: "0.125rem" }}>
                {stat.label}
              </div>
              <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--gray-12)" }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-a4)" />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 11, fill: "var(--gray-11)" }}
              tickLine={{ stroke: "var(--gray-a6)" }}
              axisLine={{ stroke: "var(--gray-a6)" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--gray-11)" }}
              tickLine={{ stroke: "var(--gray-a6)" }}
              axisLine={{ stroke: "var(--gray-a6)" }}
              width={45}
              tickFormatter={(v) => formatYAxis(v, metricMode)}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                const total = payload.reduce(
                  (sum, p) => sum + (Number(p.value) || 0),
                  0
                );
                const unit = metricConfig[metricMode].unit;
                return (
                  <div className={chartStyles.tooltip}>
                    <div className={chartStyles.tooltipLabel}>{d.weekRange}</div>
                    {payload
                      .filter((p) => Number(p.value) > 0)
                      .map((p) => (
                        <div key={p.dataKey} className={chartStyles.tooltipValue}>
                          <span
                            className={chartStyles.tooltipDot}
                            style={{ backgroundColor: p.fill }}
                          />
                          {p.dataKey}: {formatMetricTotal(Number(p.value), metricMode)} {unit}
                        </div>
                      ))}
                    <div
                      style={{
                        marginTop: "0.375rem",
                        paddingTop: "0.375rem",
                        borderTop: "1px solid var(--gray-a4)",
                        fontWeight: 600,
                      }}
                    >
                      Total: {formatMetricTotal(total, metricMode)} {unit}
                    </div>
                    {metricMode === "calories" && (
                      <div style={{ fontSize: "0.6875rem", color: "var(--gray-10)", marginTop: "0.125rem" }}>
                        ≈ {formatMetricTotal(total / 7, metricMode)} {unit}/day
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: "0.75rem" }}
              formatter={(value) => (
                <span style={{ color: "var(--gray-11)" }}>{value}</span>
              )}
            />
            {allSports.map((sport) => (
              <Bar
                key={sport}
                dataKey={sport}
                stackId="volume"
                fill={sportColorMap[sport]}
                radius={[2, 2, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface WeeklyVolumeChartProps {
  activities: Activity[];
  isLoading?: boolean;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
}

export function WeeklyVolumeChart({
  activities,
  isLoading,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: WeeklyVolumeChartProps) {
  const [metricMode, setMetricMode] = useState<MetricMode>("time");

  return (
    <ChartCard
      title="Weekly Volume"
      fetchNextPage={fetchNextPage}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      description="Training volume progression by sport"
      activities={activities}
      isLoading={isLoading}
      defaultTimeSpan="90d"
      controls={
        <div className={chartStyles.toggleGroup}>
          {(["time", "distance", "elevation", "calories"] as MetricMode[]).map((mode) => (
            <button
              key={mode}
              className={`${chartStyles.toggleBtn} ${
                metricMode === mode ? chartStyles.toggleBtnActive : ""
              }`}
              onClick={() => setMetricMode(mode)}
            >
              {metricConfig[mode].label}
            </button>
          ))}
        </div>
      }
    >
      {({ filteredActivities, startDate, endDate }) => (
        <WeeklyVolumeContent
          filteredActivities={filteredActivities}
          startDate={startDate}
          endDate={endDate}
          metricMode={metricMode}
        />
      )}
    </ChartCard>
  );
}
