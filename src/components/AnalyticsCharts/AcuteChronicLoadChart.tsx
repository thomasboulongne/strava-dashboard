import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { ChartCard } from "./ChartCard";
import chartStyles from "./ChartCard.module.css";
import { computeTrainingLoad } from "../../lib/chart-utils";
import type { Activity } from "../../lib/strava-types";

const RAMP_THRESHOLD = 1.3;

function AcuteChronicContent({
  filteredActivities,
  startDate,
  endDate,
}: {
  filteredActivities: Activity[];
  startDate: Date;
  endDate: Date;
}) {
  const data = useMemo(
    () => computeTrainingLoad(filteredActivities, startDate, endDate),
    [filteredActivities, startDate, endDate]
  );

  const sampledData = useMemo(() => {
    return data.filter((_, i) => i % 3 === 0 || i === data.length - 1);
  }, [data]);

  const riskPeriods = useMemo(() => {
    const periods: { start: string; end: string }[] = [];
    let currentStart: string | null = null;

    data.forEach((point) => {
      if (point.rampRatio > RAMP_THRESHOLD) {
        if (!currentStart) currentStart = point.date;
      } else if (currentStart) {
        periods.push({ start: currentStart, end: point.date });
        currentStart = null;
      }
    });

    if (currentStart && data.length > 0) {
      periods.push({ start: currentStart, end: data[data.length - 1].date });
    }

    return periods;
  }, [data]);

  const hasData = data.some((d) => d.acuteLoad > 0);

  if (!hasData) {
    return <div className={chartStyles.emptyState}>No activities found</div>;
  }

  const maxLoad = Math.max(...data.map((d) => Math.max(d.acuteLoad, d.chronicLoad)));

  return (
    <>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={sampledData} margin={{ top: 10, right: 50, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-a4)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--gray-11)" }}
            tickLine={{ stroke: "var(--gray-a6)" }}
            axisLine={{ stroke: "var(--gray-a6)" }}
            tickFormatter={(v) =>
              new Date(v + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
            }
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="load"
            tick={{ fontSize: 11, fill: "var(--gray-11)" }}
            tickLine={{ stroke: "var(--gray-a6)" }}
            axisLine={{ stroke: "var(--gray-a6)" }}
            width={45}
            domain={[0, Math.ceil(maxLoad * 1.1)]}
            tickFormatter={(v) => `${Math.round(v)}`}
          />
          <YAxis
            yAxisId="ratio"
            orientation="right"
            tick={{ fontSize: 11, fill: "#ef4444" }}
            tickLine={{ stroke: "#ef4444" }}
            axisLine={{ stroke: "#ef4444" }}
            width={40}
            domain={[0, 2]}
            tickFormatter={(v) => v.toFixed(1)}
          />
          <ReferenceLine
            yAxisId="ratio"
            y={RAMP_THRESHOLD}
            stroke="#ef4444"
            strokeDasharray="5 5"
            label={{ value: `Risk: ${RAMP_THRESHOLD}`, position: "right", fill: "#ef4444", fontSize: 10 }}
          />
          {riskPeriods.map((period, i) => (
            <ReferenceArea key={i} yAxisId="load" x1={period.start} x2={period.end} fill="#ef4444" fillOpacity={0.1} />
          ))}
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              const isRisk = d.rampRatio > RAMP_THRESHOLD;
              return (
                <div className={chartStyles.tooltip}>
                  <div className={chartStyles.tooltipLabel}>
                    {new Date(d.date + "T12:00:00").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                  <div className={chartStyles.tooltipValue}>
                    <span className={chartStyles.tooltipDot} style={{ backgroundColor: "#f97316" }} />
                    Acute (7d): {Math.round(d.acuteLoad)} min
                  </div>
                  <div className={chartStyles.tooltipValue}>
                    <span className={chartStyles.tooltipDot} style={{ backgroundColor: "#3b82f6" }} />
                    Chronic (28d avg): {Math.round(d.chronicLoad)} min
                  </div>
                  <div className={chartStyles.tooltipValue} style={{ color: isRisk ? "#ef4444" : "inherit" }}>
                    <span
                      className={chartStyles.tooltipDot}
                      style={{ backgroundColor: isRisk ? "#ef4444" : "#a855f7" }}
                    />
                    Ramp ratio: {d.rampRatio.toFixed(2)}
                    {isRisk && " ⚠️"}
                  </div>
                </div>
              );
            }}
          />
          <Area
            yAxisId="load"
            type="monotone"
            dataKey="chronicLoad"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.2}
            strokeWidth={2}
            name="Chronic load"
            connectNulls
          />
          <Line
            yAxisId="load"
            type="monotone"
            dataKey="acuteLoad"
            stroke="#f97316"
            strokeWidth={2}
            dot={false}
            name="Acute load"
            connectNulls
          />
          <Line
            yAxisId="ratio"
            type="monotone"
            dataKey="rampRatio"
            stroke="#a855f7"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            dot={false}
            name="Ramp ratio"
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className={chartStyles.legend}>
        <span className={chartStyles.legendItem}>
          <span className={chartStyles.legendDot} style={{ backgroundColor: "#f97316" }} />
          Acute (7d)
        </span>
        <span className={chartStyles.legendItem}>
          <span className={chartStyles.legendDot} style={{ backgroundColor: "#3b82f6" }} />
          Chronic (28d)
        </span>
        <span className={chartStyles.legendItem}>
          <span className={chartStyles.legendDot} style={{ backgroundColor: "#a855f7" }} />
          Ramp ratio
        </span>
        <span className={chartStyles.legendItem} style={{ color: "#ef4444" }}>
          ⚠️ Risk zone (&gt;{RAMP_THRESHOLD})
        </span>
      </div>
    </>
  );
}

interface AcuteChronicLoadChartProps {
  activities: Activity[];
  isLoading?: boolean;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
}

export function AcuteChronicLoadChart({
  activities,
  isLoading,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: AcuteChronicLoadChartProps) {
  return (
    <ChartCard
      title="Training Load (Acute vs Chronic)"
      description="7-day vs 28-day load with ramp ratio - detect overtraining risk"
      activities={activities}
      isLoading={isLoading}
      defaultTimeSpan="90d"
      fetchNextPage={fetchNextPage}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
    >
      {({ filteredActivities, startDate, endDate }) => (
        <AcuteChronicContent filteredActivities={filteredActivities} startDate={startDate} endDate={endDate} />
      )}
    </ChartCard>
  );
}
