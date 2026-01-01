import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  Cell,
} from "recharts";
import { ChartCard } from "./ChartCard";
import chartStyles from "./ChartCard.module.css";
import {
  computeActivityZoneBreakdown,
  aggregateZoneData,
  POWER_ZONE_COLORS,
  POWER_ZONE_LABELS,
} from "../../lib/chart-utils";
import type { Activity, ActivityStreamsMap, AthleteZones } from "../../lib/strava-types";

interface PowerZoneChartProps {
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

function PowerZoneContent({
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
    if (!zones?.power?.zones) return [];

    // Filter to activities with power data
    const powerActivities = filteredActivities.filter(
      (a) => a.average_watts !== undefined || a.device_watts
    );

    // Compute zone breakdowns for all activities with streams
    const breakdowns = powerActivities
      .map((activity) => {
        const streams = streamsMap[activity.id];
        return computeActivityZoneBreakdown(
          activity,
          streams,
          zones.heart_rate?.zones ?? null,
          zones.power?.zones ?? null
        );
      })
      .filter(
        (b): b is NonNullable<typeof b> =>
          b !== null && b.powerZones !== undefined
      );

    // Aggregate all zones
    const aggregated = aggregateZoneData(breakdowns, "power");

    // Transform for horizontal bar chart
    return aggregated.map((z) => ({
      zone: z.zone,
      label: POWER_ZONE_LABELS[z.zone - 1] || `Zone ${z.zone}`,
      shortLabel: `Z${z.zone}`,
      totalSeconds: z.totalSeconds,
      hours: z.totalSeconds / 3600,
      percentage: z.percentage,
      color: POWER_ZONE_COLORS[z.zone - 1] || POWER_ZONE_COLORS[POWER_ZONE_COLORS.length - 1],
    }));
  }, [filteredActivities, streamsMap, zones]);

  if (!zones?.power?.zones) {
    return (
      <div className={chartStyles.emptyState}>
        <p>No power zones configured</p>
        <p style={{ fontSize: "0.75rem", marginTop: "0.5rem" }}>
          Set up power zones in Strava settings
        </p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={chartStyles.emptyState}>
        No power data available for this period
      </div>
    );
  }

  const totalSeconds = data.reduce((sum, d) => sum + d.totalSeconds, 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 10, right: 30, left: 60, bottom: 10 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-a4)" />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "var(--gray-11)" }}
          tickLine={{ stroke: "var(--gray-a6)" }}
          axisLine={{ stroke: "var(--gray-a6)" }}
          tickFormatter={(v) => `${v.toFixed(1)}h`}
        />
        <YAxis
          type="category"
          dataKey="shortLabel"
          tick={{ fontSize: 11, fill: "var(--gray-11)" }}
          tickLine={{ stroke: "var(--gray-a6)" }}
          axisLine={{ stroke: "var(--gray-a6)" }}
          width={40}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div className={chartStyles.tooltip}>
                <div className={chartStyles.tooltipLabel}>{d.label}</div>
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
                  {d.percentage.toFixed(1)}% of total ({formatTime(totalSeconds)})
                </div>
              </div>
            );
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: "0.7rem", paddingTop: "0.5rem" }}
          formatter={() => (
            <span style={{ color: "var(--gray-11)" }}>
              Time in Zone
            </span>
          )}
        />
        <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PowerZoneChart({
  activities,
  streamsMap,
  zones,
  isLoading,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: PowerZoneChartProps) {
  const hasStreams = Object.keys(streamsMap).length > 0;
  const hasPowerActivities = activities.some(
    (a) => a.average_watts !== undefined || a.device_watts
  );

  if (!hasPowerActivities && !isLoading) {
    return null; // Don't show the chart if no power activities
  }

  return (
    <ChartCard
      title="Power Zones"
      description="Time distribution across power zones"
      activities={activities}
      isLoading={isLoading || (!hasStreams && !isLoading)}
      fetchNextPage={fetchNextPage}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      defaultTimeSpan="90d"
    >
      {({ filteredActivities, startDate, endDate }) => (
        <PowerZoneContent
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

