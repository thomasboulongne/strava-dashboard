import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { ChartCard } from "./ChartCard";
import chartStyles from "./ChartCard.module.css";
import { getDurationDistribution } from "../../lib/chart-utils";
import type { Activity } from "../../lib/strava-types";

const BUCKET_COLORS = [
  "#fca5a5", // 0-30: red (very short)
  "#fcd34d", // 30-60: yellow (short)
  "#86efac", // 60-90: light green (moderate)
  "#22c55e", // 90-120: green (good)
  "#16a34a", // 120-180: dark green (long)
  "#15803d", // 180+: darkest green (very long)
];

function DurationDistributionContent({
  filteredActivities,
}: {
  filteredActivities: Activity[];
}) {
  const data = useMemo(
    () => getDurationDistribution(filteredActivities),
    [filteredActivities]
  );

  const totalRides = data.reduce((sum, d) => sum + d.count, 0);

  if (totalRides === 0) {
    return (
      <div className={chartStyles.emptyState}>No ride activities found</div>
    );
  }

  return (
    <>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-a4)" />
          <XAxis
            dataKey="bucket"
            tick={{ fontSize: 11, fill: "var(--gray-11)" }}
            tickLine={{ stroke: "var(--gray-a6)" }}
            axisLine={{ stroke: "var(--gray-a6)" }}
            label={{
              value: "Duration (min)",
              position: "insideBottom",
              offset: -5,
              fontSize: 10,
              fill: "var(--gray-10)",
            }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--gray-11)" }}
            tickLine={{ stroke: "var(--gray-a6)" }}
            axisLine={{ stroke: "var(--gray-a6)" }}
            width={35}
            allowDecimals={false}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              const percentage = ((d.count / totalRides) * 100).toFixed(1);
              return (
                <div className={chartStyles.tooltip}>
                  <div className={chartStyles.tooltipLabel}>
                    {d.bucket} minutes
                  </div>
                  <div className={chartStyles.tooltipValue}>
                    {d.count} rides ({percentage}%)
                  </div>
                </div>
              );
            }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((_, index) => (
              <Cell key={index} fill={BUCKET_COLORS[index]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className={chartStyles.legend}>
        <span className={chartStyles.legendItem}>
          Total: {totalRides} rides
        </span>
        <span className={chartStyles.legendItem}>
          Under 60min:{" "}
          {(((data[0].count + data[1].count) / totalRides) * 100).toFixed(0)}%
        </span>
        <span className={chartStyles.legendItem}>
          Over 90min:{" "}
          {(
            (data.slice(3).reduce((s, d) => s + d.count, 0) / totalRides) *
            100
          ).toFixed(0)}
          %
        </span>
      </div>
    </>
  );
}

interface DurationDistributionChartProps {
  activities: Activity[];
  isLoading?: boolean;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
}

export function DurationDistributionChart({
  activities,
  isLoading,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: DurationDistributionChartProps) {
  return (
    <ChartCard
      title="Duration Distribution"
      description="Ride duration histogram - spot junk volume patterns"
      activities={activities}
      isLoading={isLoading}
      defaultTimeSpan="90d"
      fetchNextPage={fetchNextPage}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
    >
      {({ filteredActivities }) => (
        <DurationDistributionContent filteredActivities={filteredActivities} />
      )}
    </ChartCard>
  );
}
