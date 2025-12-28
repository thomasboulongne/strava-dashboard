import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { ChartCard } from "./ChartCard";
import chartStyles from "./ChartCard.module.css";
import {
  getWeeklyMaxRides,
  type WeeklyMaxRideData,
} from "../../lib/chart-utils";
import type { Activity } from "../../lib/strava-types";

const STRAVA_ACTIVITY_URL = "https://www.strava.com/activities";

function LongRideContent({
  filteredActivities,
  startDate,
  endDate,
}: {
  filteredActivities: Activity[];
  startDate: Date;
  endDate: Date;
}) {
  const data = useMemo(
    () => getWeeklyMaxRides(filteredActivities, startDate, endDate),
    [filteredActivities, startDate, endDate]
  );

  const avgDuration = useMemo(() => {
    const nonZero = data.filter((d) => d.maxDurationHours > 0);
    if (nonZero.length === 0) return 0;
    return (
      nonZero.reduce((sum, d) => sum + d.maxDurationHours, 0) / nonZero.length
    );
  }, [data]);

  if (data.length === 0 || data.every((d) => d.maxDurationHours === 0)) {
    return (
      <div className={chartStyles.emptyState}>No ride activities found</div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-a4)" />
        <XAxis
          dataKey="weekLabel"
          tick={{ fontSize: 11, fill: "var(--gray-11)" }}
          tickLine={{ stroke: "var(--gray-a6)" }}
          axisLine={{ stroke: "var(--gray-a6)" }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--gray-11)" }}
          tickLine={{ stroke: "var(--gray-a6)" }}
          axisLine={{ stroke: "var(--gray-a6)" }}
          width={40}
          tickFormatter={(v) => `${v}h`}
          domain={[0, "auto"]}
        />
        {avgDuration > 0 && (
          <ReferenceLine
            y={avgDuration}
            stroke="var(--gray-8)"
            strokeDasharray="5 5"
            label={{
              value: `Avg: ${avgDuration.toFixed(1)}h`,
              position: "right",
              fill: "var(--gray-10)",
              fontSize: 10,
            }}
          />
        )}
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as WeeklyMaxRideData;
            if (!d.maxActivity) {
              return (
                <div className={chartStyles.tooltip}>
                  <div className={chartStyles.tooltipLabel}>{d.weekRange}</div>
                  <div className={chartStyles.tooltipValue}>
                    No rides this week
                  </div>
                </div>
              );
            }
            return (
              <div className={chartStyles.tooltip}>
                <div className={chartStyles.tooltipLabel}>{d.weekRange}</div>
                <div className={chartStyles.tooltipValue}>
                  <span
                    className={chartStyles.tooltipDot}
                    style={{ backgroundColor: "#f97316" }}
                  />
                  {d.maxDurationHours.toFixed(1)} hours
                </div>
                <a
                  href={`${STRAVA_ACTIVITY_URL}/${d.maxActivity.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={chartStyles.tooltipLink}
                >
                  {d.maxActivity.name}
                </a>
              </div>
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="maxDurationHours"
          stroke="#f97316"
          strokeWidth={2}
          dot={(props) => {
            if (props.payload.maxDurationHours === 0)
              return <g key={props.key} />;
            return (
              <circle
                key={props.key}
                cx={props.cx}
                cy={props.cy}
                r={4}
                fill="#f97316"
              />
            );
          }}
          activeDot={{ r: 6, fill: "#f97316" }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface LongRideProgressionChartProps {
  activities: Activity[];
  isLoading?: boolean;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
}

export function LongRideProgressionChart({
  activities,
  isLoading,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: LongRideProgressionChartProps) {
  return (
    <ChartCard
      title="Long Ride Progression"
      description="Weekly max ride duration - track long-session build"
      activities={activities}
      isLoading={isLoading}
      defaultTimeSpan="90d"
      fetchNextPage={fetchNextPage}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
    >
      {({ filteredActivities, startDate, endDate }) => (
        <LongRideContent
          filteredActivities={filteredActivities}
          startDate={startDate}
          endDate={endDate}
        />
      )}
    </ChartCard>
  );
}
