import { useMemo, useState } from "react";
import { ChartCard } from "./ChartCard";
import chartStyles from "./ChartCard.module.css";
import { bucketByDay, type DailyActivityData } from "../../lib/chart-utils";
import type { Activity } from "../../lib/strava-types";

const INTENSITY_COLORS = [
  "var(--gray-a3)",
  "var(--green-a4)",
  "var(--green-a6)",
  "var(--green-a8)",
  "var(--green-a10)",
];

const INTENSITY_LABELS = ["0", "1-30", "31-60", "61-120", "120+"];

function HeatmapContent({
  filteredActivities,
  startDate,
  endDate,
}: {
  filteredActivities: Activity[];
  startDate: Date;
  endDate: Date;
}) {
  const [hoveredDay, setHoveredDay] = useState<DailyActivityData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const data = useMemo(
    () => bucketByDay(filteredActivities, startDate, endDate),
    [filteredActivities, startDate, endDate]
  );

  const weeks = useMemo(() => {
    const result: DailyActivityData[][] = [];
    let currentWeek: DailyActivityData[] = [];

    data.forEach((day) => {
      const date = new Date(day.date + "T12:00:00");
      const dayOfWeek = date.getDay();

      if (dayOfWeek === 0 && currentWeek.length > 0) {
        result.push(currentWeek);
        currentWeek = [];
      }

      if (result.length === 0 && currentWeek.length === 0 && dayOfWeek !== 0) {
        for (let i = 0; i < dayOfWeek; i++) {
          currentWeek.push({ date: "", minutes: 0, intensityBin: 0 });
        }
      }

      currentWeek.push(day);
    });

    if (currentWeek.length > 0) result.push(currentWeek);
    return result;
  }, [data]);

  const monthLabels = useMemo(() => {
    const labels: { month: string; weekIndex: number }[] = [];
    let lastMonth = "";

    weeks.forEach((week, weekIndex) => {
      const validDay = week.find((d) => d.date);
      if (!validDay) return;

      const date = new Date(validDay.date + "T12:00:00");
      const month = date.toLocaleDateString("en-US", { month: "short" });

      if (month !== lastMonth) {
        labels.push({ month, weekIndex });
        lastMonth = month;
      }
    });

    return labels;
  }, [weeks]);

  // Create a map of weekIndex to month label for inline display
  const weekMonthMap = useMemo(() => {
    const map = new Map<number, string>();
    monthLabels.forEach(({ month, weekIndex }) => {
      map.set(weekIndex, month);
    });
    return map;
  }, [monthLabels]);

  if (data.length === 0) {
    return <div className={chartStyles.emptyState}>No activities found</div>;
  }

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div style={{ position: "relative" }}>
      <div className={chartStyles.heatmapMobileLegend}>
        <span>↓ Sun–Sat</span>
        <span style={{ marginLeft: "auto" }}>→ Weeks</span>
      </div>

      <div
        className={chartStyles.heatmapMonthLabels}
        style={{ marginLeft: "2rem" }}
      >
        {monthLabels.map(({ month, weekIndex }, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `calc(2rem + ${weekIndex * 14}px)`,
            }}
          >
            {month}
          </span>
        ))}
      </div>

      <div className={chartStyles.heatmapWrapper}>
        <div className={chartStyles.heatmapDayLabels}>
          {dayLabels.map((label, i) => (
            <div
              key={i}
              className={chartStyles.heatmapDayLabel}
              style={{ visibility: i % 2 === 1 ? "visible" : "hidden" }}
            >
              {label}
            </div>
          ))}
        </div>

        <div className={chartStyles.heatmapContainer}>
          <div className={chartStyles.heatmapGrid}>
            {weeks.map((week, weekIndex) => (
              <div
                key={weekIndex}
                className={chartStyles.heatmapWeek}
                data-month={weekMonthMap.get(weekIndex) || undefined}
              >
                {weekMonthMap.has(weekIndex) && (
                  <span className={chartStyles.heatmapInlineMonth}>
                    {weekMonthMap.get(weekIndex)}
                  </span>
                )}
                {week.map((day, dayIndex) => (
                  <div
                    key={dayIndex}
                    className={chartStyles.heatmapDay}
                    style={{
                      backgroundColor: day.date
                        ? INTENSITY_COLORS[day.intensityBin]
                        : "transparent",
                      cursor: day.date ? "pointer" : "default",
                    }}
                    onMouseEnter={(e) => {
                      if (day.date) {
                        setHoveredDay(day);
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltipPos({
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                        });
                      }
                    }}
                    onMouseLeave={() => setHoveredDay(null)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={chartStyles.heatmapLegend}>
        <span>Less</span>
        {INTENSITY_COLORS.map((color, i) => (
          <div
            key={i}
            className={chartStyles.heatmapDay}
            style={{ backgroundColor: color }}
            title={`${INTENSITY_LABELS[i]} min`}
          />
        ))}
        <span>More</span>
      </div>

      {hoveredDay && (
        <div
          className={chartStyles.tooltip}
          style={{
            position: "fixed",
            left: tooltipPos.x,
            top: tooltipPos.y - 8,
            transform: "translate(-50%, -100%)",
            zIndex: 1000,
            pointerEvents: "none",
          }}
        >
          <div className={chartStyles.tooltipLabel}>
            {new Date(hoveredDay.date + "T12:00:00").toLocaleDateString(
              "en-US",
              {
                weekday: "short",
                month: "short",
                day: "numeric",
              }
            )}
          </div>
          <div className={chartStyles.tooltipValue}>
            {Math.round(hoveredDay.minutes)} minutes
          </div>
        </div>
      )}
    </div>
  );
}

interface ConsistencyHeatmapProps {
  activities: Activity[];
  isLoading?: boolean;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
}

export function ConsistencyHeatmap({
  activities,
  isLoading,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: ConsistencyHeatmapProps) {
  return (
    <ChartCard
      title="Consistency Heatmap"
      description="Daily activity minutes - highlight consistency and gaps"
      activities={activities}
      isLoading={isLoading}
      defaultTimeSpan="ytd"
      fetchNextPage={fetchNextPage}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
    >
      {({ filteredActivities, startDate, endDate }) => (
        <HeatmapContent
          filteredActivities={filteredActivities}
          startDate={startDate}
          endDate={endDate}
        />
      )}
    </ChartCard>
  );
}
