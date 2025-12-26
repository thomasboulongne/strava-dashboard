import { useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { ChartCard } from "./ChartCard";
import chartStyles from "./ChartCard.module.css";
import { getClimbingFocusData } from "../../lib/chart-utils";
import type { Activity } from "../../lib/strava-types";

function ClimbingFocusContent({
  filteredActivities,
  startDate,
  endDate,
}: {
  filteredActivities: Activity[];
  startDate: Date;
  endDate: Date;
}) {
  const data = useMemo(
    () => getClimbingFocusData(filteredActivities, startDate, endDate),
    [filteredActivities, startDate, endDate]
  );

  const hasData = data.some((d) => d.totalElevation > 0);

  if (!hasData) {
    return <div className={chartStyles.emptyState}>No ride activities found</div>;
  }

  const maxElev = Math.max(...data.map((d) => d.totalElevation));
  const maxRate = Math.max(...data.map((d) => d.avgVerticalRate));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 45, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-a4)" />
        <XAxis
          dataKey="weekLabel"
          tick={{ fontSize: 11, fill: "var(--gray-11)" }}
          tickLine={{ stroke: "var(--gray-a6)" }}
          axisLine={{ stroke: "var(--gray-a6)" }}
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="elevation"
          tick={{ fontSize: 11, fill: "var(--gray-11)" }}
          tickLine={{ stroke: "var(--gray-a6)" }}
          axisLine={{ stroke: "var(--gray-a6)" }}
          width={45}
          domain={[0, Math.ceil(maxElev * 1.1)]}
          tickFormatter={(v) => `${v}m`}
        />
        <YAxis
          yAxisId="rate"
          orientation="right"
          tick={{ fontSize: 11, fill: "#f59e0b" }}
          tickLine={{ stroke: "#f59e0b" }}
          axisLine={{ stroke: "#f59e0b" }}
          width={45}
          domain={[0, Math.ceil(maxRate * 1.1)]}
          tickFormatter={(v) => `${Math.round(v)}`}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div className={chartStyles.tooltip}>
                <div className={chartStyles.tooltipLabel}>{d.weekLabel}</div>
                <div className={chartStyles.tooltipValue}>
                  <span className={chartStyles.tooltipDot} style={{ backgroundColor: "#22c55e" }} />
                  Elevation: {Math.round(d.totalElevation)}m
                </div>
                <div className={chartStyles.tooltipValue}>
                  <span className={chartStyles.tooltipDot} style={{ backgroundColor: "#f59e0b" }} />
                  Vertical rate: {Math.round(d.avgVerticalRate)} m/h
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--gray-10)", marginTop: "0.25rem" }}>
                  {d.rideCount} ride{d.rideCount !== 1 ? "s" : ""}
                </div>
              </div>
            );
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: "0.75rem" }}
          formatter={(value) => <span style={{ color: "var(--gray-11)" }}>{value}</span>}
        />
        <Bar
          yAxisId="elevation"
          dataKey="totalElevation"
          fill="#22c55e"
          fillOpacity={0.8}
          radius={[3, 3, 0, 0]}
          name="Total elevation (m)"
        />
        <Line
          yAxisId="rate"
          type="monotone"
          dataKey="avgVerticalRate"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={{ fill: "#f59e0b", r: 3 }}
          activeDot={{ r: 5 }}
          name="Avg vertical rate (m/h)"
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

interface ClimbingFocusChartProps {
  activities: Activity[];
  isLoading?: boolean;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
}

export function ClimbingFocusChart({
  activities,
  isLoading,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: ClimbingFocusChartProps) {
  return (
    <ChartCard
      title="Climbing Focus"
      description="Weekly elevation and vertical rate (m/h)"
      activities={activities}
      isLoading={isLoading}
      defaultTimeSpan="90d"
      fetchNextPage={fetchNextPage}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
    >
      {({ filteredActivities, startDate, endDate }) => (
        <ClimbingFocusContent
          filteredActivities={filteredActivities}
          startDate={startDate}
          endDate={endDate}
        />
      )}
    </ChartCard>
  );
}
