import { useState, useMemo, useEffect, type ReactNode } from "react";
import { Spinner } from "@radix-ui/themes";
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
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  children,
  controls,
}: ChartCardProps) {
  const [timeSpan, setTimeSpan] = useState<TimeSpan>(defaultTimeSpan);
  const [userChangedTimeSpan, setUserChangedTimeSpan] = useState(false);

  // Auto-fetch more activities when user manually selects YTD or All
  useEffect(() => {
    if (
      userChangedTimeSpan &&
      (timeSpan === "ytd" || timeSpan === "all") &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage?.();
    }
  }, [
    timeSpan,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    userChangedTimeSpan,
  ]);

  const handleTimeSpanChange = (newTimeSpan: TimeSpan) => {
    setUserChangedTimeSpan(true);
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
            <Spinner size="3" />
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
