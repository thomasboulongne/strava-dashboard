import { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceArea,
  Legend,
} from "recharts";
import { ChartCard } from "./ChartCard";
import chartStyles from "./ChartCard.module.css";
import { getHRTrendData, HR_ZONE_COLORS } from "../../lib/chart-utils";
import type {
  Activity,
  ActivityStreamsMap,
  AthleteZones,
  HeartRateZoneRange,
} from "../../lib/strava-types";

interface HRTrendChartProps {
  activities: Activity[];
  streamsMap: ActivityStreamsMap;
  zones: AthleteZones | null;
  isLoading?: boolean;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
}

type HRMetric = "avg" | "max";

const metricConfig = {
  avg: { label: "Avg HR", key: "avgHR" as const },
  max: { label: "Max HR", key: "maxHR" as const },
};

function HRTrendContent({
  filteredActivities,
  streamsMap,
  zones,
  metric,
}: {
  filteredActivities: Activity[];
  startDate: Date;
  endDate: Date;
  streamsMap: ActivityStreamsMap;
  zones: AthleteZones | null;
  metric: HRMetric;
}) {
  const { data, zoneRanges } = useMemo(() => {
    const hrTrend = getHRTrendData(filteredActivities, streamsMap);

    // Get zone boundaries for background bands
    const hrZones = zones?.heart_rate?.zones ?? [];

    return {
      data: hrTrend.map((d) => ({
        ...d,
        dateLabel: new Date(d.date + "T12:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        value: metric === "avg" ? d.avgHR : d.maxHR,
      })),
      zoneRanges: hrZones,
    };
  }, [filteredActivities, streamsMap, zones, metric]);

  // Calculate rolling average (7-day window) - must be before early return
  const rollingAvg = useMemo(() => {
    const windowSize = 7;
    const dateMap = new Map<string, number[]>();

    // Group values by date
    data.forEach((d) => {
      if (d.value !== null) {
        if (!dateMap.has(d.date)) {
          dateMap.set(d.date, []);
        }
        dateMap.get(d.date)!.push(d.value);
      }
    });

    // Calculate daily average first
    const dailyAvg = new Map<string, number>();
    dateMap.forEach((vals, date) => {
      dailyAvg.set(date, vals.reduce((a, b) => a + b, 0) / vals.length);
    });

    // Then calculate rolling average
    const sortedDates = Array.from(dailyAvg.keys()).sort();
    const result: Array<{
      date: string;
      dateLabel: string;
      rollingAvg: number;
    }> = [];

    sortedDates.forEach((date, i) => {
      const windowStart = Math.max(0, i - windowSize + 1);
      const windowDates = sortedDates.slice(windowStart, i + 1);
      const windowValues = windowDates.map((d) => dailyAvg.get(d)!);
      const avg = windowValues.reduce((a, b) => a + b, 0) / windowValues.length;

      result.push({
        date,
        dateLabel: new Date(date + "T12:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        rollingAvg: avg,
      });
    });

    return result;
  }, [data]);

  if (data.length === 0) {
    return (
      <div className={chartStyles.emptyState}>
        No HR data available for this period
      </div>
    );
  }

  // Calculate y-axis domain
  const values = data
    .map((d) => d.value)
    .filter((v): v is number => v !== null);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const yMin = Math.max(0, Math.floor(minVal / 10) * 10 - 10);
  const yMax = Math.ceil(maxVal / 10) * 10 + 10;

  // Render zone background bands
  const renderZoneBands = (zoneRanges: HeartRateZoneRange[]) => {
    if (zoneRanges.length === 0) return null;

    return zoneRanges.map((zone, i) => {
      const y1 = Math.max(yMin, zone.min);
      const y2 = Math.min(yMax, zone.max);

      if (y1 >= yMax || y2 <= yMin) return null;

      return (
        <ReferenceArea
          key={i}
          y1={y1}
          y2={y2}
          fill={HR_ZONE_COLORS[i]}
          fillOpacity={0.1}
          stroke="none"
        />
      );
    });
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-a4)" />

        {/* Zone background bands */}
        {renderZoneBands(zoneRanges)}

        <XAxis
          dataKey="dateLabel"
          type="category"
          allowDuplicatedCategory={false}
          tick={{ fontSize: 11, fill: "var(--gray-11)" }}
          tickLine={{ stroke: "var(--gray-a6)" }}
          axisLine={{ stroke: "var(--gray-a6)" }}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[yMin, yMax]}
          tick={{ fontSize: 11, fill: "var(--gray-11)" }}
          tickLine={{ stroke: "var(--gray-a6)" }}
          axisLine={{ stroke: "var(--gray-a6)" }}
          width={45}
          tickFormatter={(v) => `${v}`}
          label={{
            value: "BPM",
            angle: -90,
            position: "insideLeft",
            fill: "var(--gray-10)",
            fontSize: 10,
          }}
        />

        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;

            // Get the first payload item
            const firstPayload = payload[0];
            const d = firstPayload.payload;

            // Determine the HR value - could be from scatter (value) or line (rollingAvg)
            const hrValue = d.value ?? d.rollingAvg ?? firstPayload.value;
            const isRollingAvg =
              d.rollingAvg !== undefined && d.value === undefined;

            // Find zone
            let zoneName = "";
            if (zoneRanges.length > 0 && hrValue) {
              for (let i = 0; i < zoneRanges.length; i++) {
                if (
                  hrValue >= zoneRanges[i].min &&
                  hrValue < zoneRanges[i].max
                ) {
                  zoneName = `Zone ${i + 1}`;
                  break;
                }
              }
            }

            return (
              <div className={chartStyles.tooltip}>
                <div className={chartStyles.tooltipLabel}>
                  {d.name || d.dateLabel}
                </div>
                <div className={chartStyles.tooltipValue}>
                  <span
                    className={chartStyles.tooltipDot}
                    style={{ backgroundColor: "#ef4444" }}
                  />
                  {isRollingAvg
                    ? `7-day Avg: ${Math.round(hrValue)} bpm`
                    : `${metric === "avg" ? "Avg" : "Max"} HR: ${Math.round(
                        hrValue
                      )} bpm`}
                </div>
                {zoneName && (
                  <div style={{ color: "var(--gray-10)", fontSize: "0.75rem" }}>
                    {zoneName}
                  </div>
                )}
                {d.sportType && (
                  <div
                    style={{
                      color: "var(--gray-10)",
                      fontSize: "0.75rem",
                      marginTop: "0.25rem",
                    }}
                  >
                    {d.sportType}
                  </div>
                )}
              </div>
            );
          }}
        />

        <Legend
          wrapperStyle={{ fontSize: "0.7rem" }}
          formatter={(value) => (
            <span style={{ color: "var(--gray-11)" }}>{value}</span>
          )}
        />

        {/* Individual activity points */}
        <Scatter
          name={metricConfig[metric].label}
          data={data}
          dataKey="value"
          fill="#ef4444"
          fillOpacity={0.6}
        />

        {/* Rolling average trend line */}
        <Line
          name="7-day Avg"
          data={rollingAvg}
          dataKey="rollingAvg"
          type="monotone"
          stroke="#ef4444"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function HRTrendChart({
  activities,
  streamsMap,
  zones,
  isLoading,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: HRTrendChartProps) {
  const [metric, setMetric] = useState<HRMetric>("avg");
  const hasStreams = Object.keys(streamsMap).length > 0;
  const hasHRActivities = activities.some((a) => a.has_heartrate);

  if (!hasHRActivities && !isLoading) {
    return null;
  }

  return (
    <ChartCard
      title="HR Trend"
      description="Heart rate over time with zone bands"
      activities={activities}
      isLoading={isLoading || (!hasStreams && !isLoading)}
      fetchNextPage={fetchNextPage}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      defaultTimeSpan="90d"
      controls={
        <div className={chartStyles.toggleGroup}>
          {(["avg", "max"] as HRMetric[]).map((m) => (
            <button
              key={m}
              className={`${chartStyles.toggleBtn} ${
                metric === m ? chartStyles.toggleBtnActive : ""
              }`}
              onClick={() => setMetric(m)}
            >
              {metricConfig[m].label}
            </button>
          ))}
        </div>
      }
    >
      {({ filteredActivities, startDate, endDate }) => (
        <HRTrendContent
          filteredActivities={filteredActivities}
          startDate={startDate}
          endDate={endDate}
          streamsMap={streamsMap}
          zones={zones}
          metric={metric}
        />
      )}
    </ChartCard>
  );
}
