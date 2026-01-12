import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
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
  getISOWeekKey,
  getWeekStart,
  formatWeekRange,
  computeActivityZoneBreakdown,
  HR_ZONE_COLORS,
} from "../../lib/chart-utils";
import type { Activity, ActivityStreamsMap, AthleteZones } from "../../lib/strava-types";

interface TrainingIntensityChartProps {
  activities: Activity[];
  streamsMap: ActivityStreamsMap;
  zones: AthleteZones | null;
  isLoading?: boolean;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
}

type IntensityMode = "weighted" | "z3plus" | "z4plus";

const modeConfig = {
  weighted: { label: "Weighted", description: "Intensity-weighted training load" },
  z3plus: { label: "Z3+", description: "Time in zone 3 and above" },
  z4plus: { label: "Z4+", description: "Time in zone 4 and above (high intensity)" },
};

function TrainingIntensityContent({
  filteredActivities,
  startDate,
  endDate,
  streamsMap,
  zones,
  mode,
}: {
  filteredActivities: Activity[];
  startDate: Date;
  endDate: Date;
  streamsMap: ActivityStreamsMap;
  zones: AthleteZones | null;
  mode: IntensityMode;
}) {
  const data = useMemo(() => {
    // Generate weeks
    const weekMap = new Map<
      string,
      {
        weekKey: string;
        weekLabel: string;
        weekRange: string;
        totalHours: number;
        intensityHours: number;
        z3Hours: number;
        z4Hours: number;
        z5Hours: number;
        weightedLoad: number;
      }
    >();

    const current = getWeekStart(startDate);
    while (current <= endDate) {
      const weekKey = getISOWeekKey(current);
      const weekLabel = current.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      weekMap.set(weekKey, {
        weekKey,
        weekLabel,
        weekRange: formatWeekRange(current),
        totalHours: 0,
        intensityHours: 0,
        z3Hours: 0,
        z4Hours: 0,
        z5Hours: 0,
        weightedLoad: 0,
      });
      current.setDate(current.getDate() + 7);
    }

    // Compute breakdowns and aggregate
    filteredActivities.forEach((activity) => {
      const date = new Date(activity.start_date_local);
      const weekKey = getISOWeekKey(date);
      const week = weekMap.get(weekKey);
      if (!week) return;

      const activityHours = activity.moving_time / 3600;
      week.totalHours += activityHours;

      const streams = streamsMap[activity.id];
      if (!streams || !zones?.heart_rate?.zones) {
        // Fallback: estimate intensity from average HR if available
        if (activity.average_heartrate && activity.max_heartrate) {
          const hrRatio = activity.average_heartrate / activity.max_heartrate;
          // Rough estimate: higher ratio = higher intensity
          week.weightedLoad += activityHours * (hrRatio * 2);
          if (hrRatio > 0.7) week.z3Hours += activityHours * 0.5;
          if (hrRatio > 0.8) week.z4Hours += activityHours * 0.3;
          if (hrRatio > 0.9) week.z5Hours += activityHours * 0.2;
        }
        return;
      }

      const breakdown = computeActivityZoneBreakdown(
        activity,
        streams,
        zones.heart_rate.zones,
        zones.power?.zones ?? null
      );

      if (!breakdown) return;

      breakdown.hrZones.forEach((z) => {
        const hours = z.seconds / 3600;
        // Weight zones by intensity (Z1=1, Z2=1.5, Z3=2, Z4=2.5, Z5=3)
        const weight = 0.5 + z.zone * 0.5;
        week.weightedLoad += hours * weight;

        if (z.zone >= 3) week.z3Hours += hours;
        if (z.zone >= 4) week.z4Hours += hours;
        if (z.zone === 5) week.z5Hours += hours;
      });
    });

    return Array.from(weekMap.values())
      .sort((a, b) => a.weekKey.localeCompare(b.weekKey))
      .map((week) => ({
        ...week,
        value:
          mode === "weighted"
            ? week.weightedLoad
            : mode === "z3plus"
            ? week.z3Hours
            : week.z4Hours + week.z5Hours,
      }));
  }, [filteredActivities, startDate, endDate, streamsMap, zones, mode]);

  if (data.length === 0) {
    return (
      <div className={chartStyles.emptyState}>
        No data available for this period
      </div>
    );
  }

  // Calculate average for reference line
  const values = data.map((d) => d.value).filter((v) => v > 0);
  const avgValue = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  // Color gradient based on mode
  const gradientId = `intensity-gradient-${mode}`;
  const areaColor =
    mode === "weighted"
      ? "#f97316"
      : mode === "z3plus"
      ? HR_ZONE_COLORS[2]
      : HR_ZONE_COLORS[3];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={areaColor} stopOpacity={0.4} />
            <stop offset="95%" stopColor={areaColor} stopOpacity={0.05} />
          </linearGradient>
        </defs>
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
          width={45}
          tickFormatter={(v) =>
            mode === "weighted" ? v.toFixed(0) : `${v.toFixed(1)}h`
          }
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div className={chartStyles.tooltip}>
                <div className={chartStyles.tooltipLabel}>{d.weekRange}</div>
                <div className={chartStyles.tooltipValue}>
                  <span
                    className={chartStyles.tooltipDot}
                    style={{ backgroundColor: areaColor }}
                  />
                  {mode === "weighted"
                    ? `Load: ${d.value.toFixed(1)}`
                    : `${d.value.toFixed(1)}h`}
                </div>
                <div
                  style={{
                    color: "var(--gray-10)",
                    fontSize: "0.75rem",
                    marginTop: "0.375rem",
                    borderTop: "1px solid var(--gray-a4)",
                    paddingTop: "0.375rem",
                  }}
                >
                  Total: {d.totalHours.toFixed(1)}h
                  {mode !== "weighted" && (
                    <>
                      <br />
                      {((d.value / d.totalHours) * 100 || 0).toFixed(0)}% intensity
                    </>
                  )}
                </div>
              </div>
            );
          }}
        />
        {avgValue > 0 && (
          <ReferenceLine
            y={avgValue}
            stroke="var(--gray-9)"
            strokeDasharray="5 5"
            label={{
              value: `Avg: ${mode === "weighted" ? avgValue.toFixed(0) : avgValue.toFixed(1) + "h"}`,
              fill: "var(--gray-10)",
              fontSize: 10,
              position: "insideTopRight",
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="value"
          stroke={areaColor}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{
            r: 4,
            fill: areaColor,
            stroke: "var(--gray-1)",
            strokeWidth: 2,
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function TrainingIntensityChart({
  activities,
  streamsMap,
  zones,
  isLoading,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: TrainingIntensityChartProps) {
  const [mode, setMode] = useState<IntensityMode>("weighted");
  const hasStreams = Object.keys(streamsMap).length > 0;

  return (
    <ChartCard
      title="Training Intensity"
      description={modeConfig[mode].description}
      activities={activities}
      isLoading={isLoading || (!hasStreams && !isLoading)}
      fetchNextPage={fetchNextPage}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      defaultTimeSpan="90d"
      controls={
        <div className={chartStyles.toggleGroup}>
          {(Object.keys(modeConfig) as IntensityMode[]).map((m) => (
            <button
              key={m}
              className={`${chartStyles.toggleBtn} ${
                mode === m ? chartStyles.toggleBtnActive : ""
              }`}
              onClick={() => setMode(m)}
            >
              {modeConfig[m].label}
            </button>
          ))}
        </div>
      }
    >
      {({ filteredActivities, startDate, endDate }) => (
        <TrainingIntensityContent
          filteredActivities={filteredActivities}
          startDate={startDate}
          endDate={endDate}
          streamsMap={streamsMap}
          zones={zones}
          mode={mode}
        />
      )}
    </ChartCard>
  );
}



