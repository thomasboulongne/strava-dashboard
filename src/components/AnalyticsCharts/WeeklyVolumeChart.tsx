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

// Sport colors for stacked bars
const SPORT_COLORS: Record<string, string> = {
  Ride: "#f97316",
  VirtualRide: "#fb923c",
  IndoorRide: "#fbbf24", // amber/yellow for indoor trainer rides
  EBikeRide: "#fdba74",
  Run: "#22c55e",
  VirtualRun: "#4ade80",
  Swim: "#3b82f6",
  Walk: "#a855f7",
  Hike: "#ec4899",
  Other: "#6b7280",
};

type MetricMode = "time" | "distance" | "elevation";

const metricConfig = {
  time: { label: "Hours", unit: "h", key: "time" as const },
  distance: { label: "Distance", unit: "km", key: "distance" as const },
  elevation: { label: "Elevation", unit: "m", key: "elevation" as const },
};

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

  const allSports = useMemo(() => {
    const sports = new Set<string>();
    data.forEach((week) => {
      Object.keys(week.bySport).forEach((sport) => sports.add(sport));
    });
    return Array.from(sports);
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
          point[sport] = Number(
            sportData[metricConfig[metricMode].key].toFixed(2)
          );
        } else {
          point[sport] = 0;
        }
      });
      return point;
    });
  }, [data, allSports, metricMode]);

  if (data.length === 0) {
    return <div className={chartStyles.emptyState}>No activities found</div>;
  }

  return (
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
          tickFormatter={(v) => (metricMode === "time" ? `${v}h` : `${v}`)}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            const total = payload.reduce(
              (sum, p) => sum + (Number(p.value) || 0),
              0
            );
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
                      {p.dataKey}: {p.value} {metricConfig[metricMode].unit}
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
                  Total: {total.toFixed(1)} {metricConfig[metricMode].unit}
                </div>
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
            fill={SPORT_COLORS[sport] || SPORT_COLORS.Other}
            radius={[2, 2, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
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
          {(["time", "distance", "elevation"] as MetricMode[]).map((mode) => (
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
