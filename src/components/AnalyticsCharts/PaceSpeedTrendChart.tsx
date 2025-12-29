import { useMemo, useState } from "react";
import {
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { ChartCard } from "./ChartCard";
import chartStyles from "./ChartCard.module.css";
import {
  getRideSpeeds,
  computeRollingMedian,
  type RideTypeFilter,
} from "../../lib/chart-utils";
import type { Activity } from "../../lib/strava-types";

const STRAVA_ACTIVITY_URL = "https://www.strava.com/activities";

// Ride type toggle configuration
const RIDE_TYPE_OPTIONS: {
  key: RideTypeFilter;
  label: string;
  color: string;
}[] = [
  { key: "Ride", label: "Road", color: "#8b5cf6" },
  { key: "GravelRide", label: "Gravel", color: "#f59e0b" },
];

function PaceSpeedContent({
  filteredActivities,
  enabledRideTypes,
}: {
  filteredActivities: Activity[];
  enabledRideTypes: Set<RideTypeFilter>;
}) {
  const speedData = useMemo(
    () => getRideSpeeds(filteredActivities, 20, enabledRideTypes),
    [filteredActivities, enabledRideTypes]
  );

  const rollingMedian = useMemo(
    () => computeRollingMedian(speedData, 14),
    [speedData]
  );

  const chartData = useMemo(() => {
    const medianMap = new Map(
      rollingMedian.map((d) => [d.date, d.medianSpeed])
    );
    const allDates = new Set([
      ...speedData.map((d) => d.date),
      ...rollingMedian.map((d) => d.date),
    ]);

    return Array.from(allDates)
      .sort()
      .map((date) => ({
        date,
        dateLabel: new Date(date + "T12:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        medianSpeed: medianMap.get(date) || null,
      }));
  }, [speedData, rollingMedian]);

  const scatterData = useMemo(
    () =>
      speedData.map((d) => {
        const typeConfig = RIDE_TYPE_OPTIONS.find((t) => t.key === d.rideType);
        return {
          ...d,
          dateLabel: new Date(d.date + "T12:00:00").toLocaleDateString(
            "en-US",
            {
              month: "short",
              day: "numeric",
            }
          ),
          fill: typeConfig?.color ?? "#8b5cf6",
        };
      }),
    [speedData]
  );

  if (speedData.length === 0) {
    return (
      <div className={chartStyles.emptyState}>
        No ride activities found (min 20 min duration)
      </div>
    );
  }

  const minSpeed = Math.floor(
    Math.min(...speedData.map((d) => d.speedKph)) - 2
  );
  const maxSpeed = Math.ceil(Math.max(...speedData.map((d) => d.speedKph)) + 2);

  return (
    <>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-a4)" />
          <XAxis
            dataKey="dateLabel"
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
            domain={[minSpeed, maxSpeed]}
            tickFormatter={(v) => `${v}`}
            label={{
              value: "km/h",
              angle: -90,
              position: "insideLeft",
              fontSize: 10,
              fill: "var(--gray-10)",
            }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload;
              if (!point) return null;

              if (point.activityId) {
                const typeLabel =
                  RIDE_TYPE_OPTIONS.find((t) => t.key === point.rideType)
                    ?.label ?? "Ride";
                return (
                  <div className={chartStyles.tooltip}>
                    <div className={chartStyles.tooltipLabel}>
                      {point.dateLabel}
                    </div>
                    <div className={chartStyles.tooltipValue}>
                      <span
                        className={chartStyles.tooltipDot}
                        style={{ backgroundColor: point.fill }}
                      />
                      {point.speedKph.toFixed(1)} km/h
                    </div>
                    <div
                      style={{ fontSize: "0.6875rem", color: "var(--gray-10)" }}
                    >
                      {typeLabel} · {Math.round(point.durationMin)} min
                    </div>
                    <a
                      href={`${STRAVA_ACTIVITY_URL}/${point.activityId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={chartStyles.tooltipLink}
                    >
                      {point.name}
                    </a>
                  </div>
                );
              }

              return (
                <div className={chartStyles.tooltip}>
                  <div className={chartStyles.tooltipLabel}>
                    {point.dateLabel}
                  </div>
                  {point.medianSpeed && (
                    <div className={chartStyles.tooltipValue}>
                      14-day median: {point.medianSpeed.toFixed(1)} km/h
                    </div>
                  )}
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="medianSpeed"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            connectNulls
            name="14-day median"
          />
          <Scatter
            data={scatterData}
            dataKey="speedKph"
            fillOpacity={0.7}
            name="Individual rides"
            shape={(props: unknown) => {
              const { cx, cy, payload } = props as {
                cx: number;
                cy: number;
                payload: { fill: string };
              };
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={5}
                  fill={payload.fill}
                  fillOpacity={0.7}
                  stroke={payload.fill}
                  strokeWidth={1}
                  strokeOpacity={0.9}
                />
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className={chartStyles.legend}>
        {RIDE_TYPE_OPTIONS.filter((t) => enabledRideTypes.has(t.key)).map(
          (t) => (
            <span key={t.key} className={chartStyles.legendItem}>
              <span
                className={chartStyles.legendDot}
                style={{ backgroundColor: t.color }}
              />
              {t.label}
            </span>
          )
        )}
        <span className={chartStyles.legendItem}>
          <span
            className={chartStyles.legendDot}
            style={{ backgroundColor: "#22c55e" }}
          />
          14-day median
        </span>
      </div>
    </>
  );
}

interface PaceSpeedTrendChartProps {
  activities: Activity[];
  isLoading?: boolean;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
}

export function PaceSpeedTrendChart({
  activities,
  isLoading,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: PaceSpeedTrendChartProps) {
  const [enabledRideTypes, setEnabledRideTypes] = useState<Set<RideTypeFilter>>(
    () => new Set(RIDE_TYPE_OPTIONS.map((t) => t.key))
  );

  const toggleRideType = (type: RideTypeFilter) => {
    setEnabledRideTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        // Don't allow deselecting all types
        if (next.size > 1) {
          next.delete(type);
        }
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const rideTypeControls = (
    <div className={chartStyles.toggleGroup}>
      {RIDE_TYPE_OPTIONS.map((option) => (
        <button
          key={option.key}
          className={`${chartStyles.toggleBtn} ${
            enabledRideTypes.has(option.key) ? chartStyles.toggleBtnActive : ""
          }`}
          onClick={() => toggleRideType(option.key)}
          title={`Toggle ${option.label} rides`}
          style={
            enabledRideTypes.has(option.key)
              ? {
                  backgroundColor: `${option.color}22`,
                  borderColor: option.color,
                  color: option.color,
                }
              : undefined
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  return (
    <ChartCard
      title="Speed Trend"
      description="Ride speed over time with 14-day rolling median"
      activities={activities}
      isLoading={isLoading}
      defaultTimeSpan="90d"
      fetchNextPage={fetchNextPage}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      controls={rideTypeControls}
    >
      {({ filteredActivities }) => (
        <PaceSpeedContent
          filteredActivities={filteredActivities}
          enabledRideTypes={enabledRideTypes}
        />
      )}
    </ChartCard>
  );
}
