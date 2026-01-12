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
} from "recharts";
import { ChartCard } from "./ChartCard";
import chartStyles from "./ChartCard.module.css";
import {
  aggregateZonesByWeek,
  computeActivityZoneBreakdown,
  HR_ZONE_COLORS,
  HR_ZONE_LABELS,
} from "../../lib/chart-utils";
import type { Activity, ActivityStreamsMap, AthleteZones } from "../../lib/strava-types";

interface HRZoneDistributionChartProps {
  activities: Activity[];
  streamsMap: ActivityStreamsMap;
  zones: AthleteZones | null;
  isLoading?: boolean;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
}

function HRZoneDistributionContent({
  filteredActivities,
  startDate,
  endDate,
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

    // Aggregate by week
    const weeklyData = aggregateZonesByWeek(
      breakdowns,
      filteredActivities,
      startDate,
      endDate,
      "hr"
    );

    // Transform for recharts - each week has zone hours
    return weeklyData.map((week) => {
      const point: Record<string, number | string> = {
        week: week.weekLabel,
        weekRange: week.weekRange,
      };
      week.zones.forEach((z) => {
        point[`zone${z.zone}`] = Number(z.hours.toFixed(2));
      });
      return point;
    });
  }, [filteredActivities, startDate, endDate, streamsMap, zones]);

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

  const zoneCount = zones.heart_rate.zones.length;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
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
          tickFormatter={(v) => `${v}h`}
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
                  .reverse()
                  .map((p, i) => {
                    const zoneNum = parseInt(
                      (p.dataKey as string).replace("zone", ""),
                      10
                    );
                    return (
                      <div key={i} className={chartStyles.tooltipValue}>
                        <span
                          className={chartStyles.tooltipDot}
                          style={{ backgroundColor: p.fill }}
                        />
                        {HR_ZONE_LABELS[zoneNum - 1]}: {p.value}h
                      </div>
                    );
                  })}
                <div
                  style={{
                    marginTop: "0.375rem",
                    paddingTop: "0.375rem",
                    borderTop: "1px solid var(--gray-a4)",
                    fontWeight: 600,
                  }}
                >
                  Total: {total.toFixed(1)}h
                </div>
              </div>
            );
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: "0.7rem" }}
          formatter={(value) => {
            const zoneNum = parseInt(value.replace("zone", ""), 10);
            return (
              <span style={{ color: "var(--gray-11)" }}>
                Z{zoneNum}
              </span>
            );
          }}
        />
        {Array.from({ length: zoneCount }).map((_, i) => (
          <Bar
            key={`zone${i + 1}`}
            dataKey={`zone${i + 1}`}
            stackId="zones"
            fill={HR_ZONE_COLORS[i] || HR_ZONE_COLORS[HR_ZONE_COLORS.length - 1]}
            radius={i === zoneCount - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HRZoneDistributionChart({
  activities,
  streamsMap,
  zones,
  isLoading,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: HRZoneDistributionChartProps) {
  const hasStreams = Object.keys(streamsMap).length > 0;

  return (
    <ChartCard
      title="HR Zone Distribution"
      description="Weekly time spent in each heart rate zone"
      activities={activities}
      isLoading={isLoading || (!hasStreams && !isLoading)}
      fetchNextPage={fetchNextPage}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      defaultTimeSpan="90d"
    >
      {({ filteredActivities, startDate, endDate }) => (
        <HRZoneDistributionContent
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



