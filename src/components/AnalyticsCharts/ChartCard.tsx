import { useState, useMemo, type ReactNode } from "react";
import { Skeleton } from "@radix-ui/themes";
import {
  type TimeSpan,
  getDateRange,
  filterActivitiesByDateRange,
} from "../../lib/chart-utils";
import type { Activity } from "../../lib/strava-types";
import styles from "./ChartCard.module.css";

const TIME_SPAN_OPTIONS: { value: TimeSpan; label: string }[] = [
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "ytd", label: "YTD" },
  { value: "all", label: "All" },
];

export interface ChartCardProps {
  title: string;
  description?: string;
  activities: Activity[];
  isLoading?: boolean;
  defaultTimeSpan?: TimeSpan;
  // These props are kept for backward compatibility but are no longer used
  // since all data now comes from the server
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  children: (props: {
    filteredActivities: Activity[];
    startDate: Date;
    endDate: Date;
    timeSpan: TimeSpan;
  }) => ReactNode;
  controls?: ReactNode;
}

export function ChartCard({
  title,
  description,
  activities,
  isLoading = false,
  defaultTimeSpan = "90d",
  // These are kept for API compatibility but unused
  fetchNextPage: _fetchNextPage,
  hasNextPage: _hasNextPage,
  isFetchingNextPage: _isFetchingNextPage,
  children,
  controls,
}: ChartCardProps) {
  const [timeSpan, setTimeSpan] = useState<TimeSpan>(defaultTimeSpan);

  const handleTimeSpanChange = (newTimeSpan: TimeSpan) => {
    setTimeSpan(newTimeSpan);
  };

  const earliestActivityDate = useMemo(() => {
    if (activities.length === 0) return undefined;
    return activities.reduce((earliest, activity) => {
      const date = new Date(activity.start_date_local);
      return date < earliest ? date : earliest;
    }, new Date());
  }, [activities]);

  const { startDate, endDate, filteredActivities } = useMemo(() => {
    const { start, end } = getDateRange(timeSpan, 0, earliestActivityDate);
    const filtered = filterActivitiesByDateRange(activities, start, end);
    return { startDate: start, endDate: end, filteredActivities: filtered };
  }, [activities, timeSpan, earliestActivityDate]);

  // Deterministic heights for skeleton bars (avoids impure Math.random during render)
  const skeletonHeights = [75, 45, 60, 85, 50, 70, 40, 80, 55, 65];

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <div>
          <h3 className={styles.chartTitle}>{title}</h3>
          {description && (
            <p className={styles.chartDescription}>{description}</p>
          )}
        </div>
        <div className={styles.controls}>
          {controls}
          <div className={styles.toggleGroup}>
            {TIME_SPAN_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`${styles.toggleBtn} ${
                  timeSpan === option.value ? styles.toggleBtnActive : ""
                }`}
                onClick={() => handleTimeSpanChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.chartContent}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <div className={styles.skeletonBars}>
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className={styles.skeletonBar}
                  style={{
                    height: `${skeletonHeights[i]}%`,
                    animationDelay: `${i * 50}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.chartArea}>
            {children({ filteredActivities, startDate, endDate, timeSpan })}
          </div>
        )}
      </div>
    </div>
  );
}
