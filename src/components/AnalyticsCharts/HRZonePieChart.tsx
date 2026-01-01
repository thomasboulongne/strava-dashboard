import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { ChartCard } from "./ChartCard";
import chartStyles from "./ChartCard.module.css";
import {
  computeActivityZoneBreakdown,
  aggregateZoneData,
  HR_ZONE_COLORS,
  HR_ZONE_LABELS,
} from "../../lib/chart-utils";
import type {
  Activity,
  ActivityStreamsMap,
  AthleteZones,
} from "../../lib/strava-types";

interface HRZonePieChartProps {
  activities: Activity[];
  streamsMap: ActivityStreamsMap;
  zones: AthleteZones | null;
  isLoading?: boolean;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function HRZonePieContent({
  filteredActivities,
  streamsMap,
  zones,
}: {
  filteredActivities: Activity[];
  startDate: Date;
  endDate: Date;
  streamsMap: ActivityStreamsMap;
  zones: AthleteZones | null;
}) {
  const data = useMemo(() => {
    if (!zones?.heart_rate?.zones) return [];

    // Compute zone breakdowns for all activities with streams
    const breakdowns = filteredActivities
      .map((activity) => {
        const streams = streamsMap[activity.id];
        return computeActivityZoneBreakdown(
          activity,
          streams,
          zones.heart_rate?.zones ?? null,
          zones.power?.zones ?? null
        );
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);

    // Aggregate all zones
    const aggregated = aggregateZoneData(breakdowns, "hr");

    // Filter out zones with 0 time
    return aggregated.filter((z) => z.totalSeconds > 0);
  }, [filteredActivities, streamsMap, zones]);

  if (!zones?.heart_rate?.zones) {
    return (
      <div className={chartStyles.emptyState}>
        <p>No heart rate zones configured</p>
        <p style={{ fontSize: "0.75rem", marginTop: "0.5rem" }}>
          Sync your Strava account to load zones
        </p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={chartStyles.emptyState}>
        No HR data available for this period
      </div>
    );
  }

  const totalSeconds = data.reduce((sum, d) => sum + d.totalSeconds, 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius="45%"
          outerRadius="75%"
          paddingAngle={2}
          dataKey="totalSeconds"
          nameKey="label"
        >
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={
                HR_ZONE_COLORS[entry.zone - 1] ||
                HR_ZONE_COLORS[HR_ZONE_COLORS.length - 1]
              }
              stroke="var(--gray-1)"
              strokeWidth={2}
            />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div className={chartStyles.tooltip}>
                <div className={chartStyles.tooltipLabel}>
                  {HR_ZONE_LABELS[d.zone - 1]}
                </div>
                <div className={chartStyles.tooltipValue}>
                  <span
                    className={chartStyles.tooltipDot}
                    style={{ backgroundColor: d.color }}
                  />
                  {formatTime(d.totalSeconds)}
                </div>
                <div
                  style={{
                    color: "var(--gray-10)",
                    fontSize: "0.75rem",
                    marginTop: "0.25rem",
                  }}
                >
                  {d.percentage.toFixed(1)}% of total
                </div>
              </div>
            );
          }}
        />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          wrapperStyle={{ fontSize: "0.7rem", paddingLeft: "1rem" }}
          formatter={(_, entry) => {
            const item = entry.payload as (typeof data)[0];
            return (
              <span style={{ color: "var(--gray-11)" }}>
                Z{item.zone} ({item.percentage.toFixed(0)}%)
              </span>
            );
          }}
        />
        {/* Center text */}
        <text
          x="38%"
          y="48%"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontSize: "0.7rem", fill: "var(--gray-10)" }}
        >
          Total Time
        </text>
        <text
          x="38%"
          y="54%"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontSize: "1rem", fill: "var(--gray-12)", fontWeight: 600 }}
        >
          {formatTime(totalSeconds)}
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
}

export function HRZonePieChart({
  activities,
  streamsMap,
  zones,
  isLoading,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: HRZonePieChartProps) {
  const hasStreams = Object.keys(streamsMap).length > 0;

  return (
    <ChartCard
      title="HR Zone Summary"
      description="Total time distribution across heart rate zones"
      activities={activities}
      isLoading={isLoading || (!hasStreams && !isLoading)}
      fetchNextPage={fetchNextPage}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      defaultTimeSpan="90d"
    >
      {({ filteredActivities, startDate, endDate }) => (
        <HRZonePieContent
          filteredActivities={filteredActivities}
          startDate={startDate}
          endDate={endDate}
          streamsMap={streamsMap}
          zones={zones}
        />
      )}
    </ChartCard>
  );
}
