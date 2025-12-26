import { useState, useMemo, useEffect } from "react";
import { Box, Heading, Flex, Text, Spinner } from "@radix-ui/themes";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { ChartControls } from "./ChartControls";
import {
  type TimeSpan,
  type MetricKey,
  type ActivityInfo,
  METRICS,
  getDateRange,
  filterActivitiesByType,
  filterActivitiesByDateRange,
  aggregateActivitiesByDate,
  getUniqueActivityTypeGroups,
  formatMetricValue,
} from "../../lib/chart-utils";
import { useActivitiesStore } from "../../stores/activitiesStore";
import type { Activity } from "../../lib/strava-types";
import styles from "./ActivityCharts.module.css";

const STRAVA_ACTIVITY_URL = "https://www.strava.com/activities";

// Locked tooltip content component
function LockedTooltipContent({
  dataPoint,
  metrics,
  onClose,
}: {
  dataPoint: { date: string; dateLabel: string; activities: ActivityInfo[] };
  metrics: Array<{ key: MetricKey; value: number }>;
  onClose: () => void;
}) {
  const date = new Date(dataPoint.date + "T12:00:00");
  const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" });
  const yearShort = `'${date.getFullYear().toString().slice(-2)}`;

  return (
    <div className={styles.tooltip} style={{ pointerEvents: "auto" }}>
      <div className={styles.tooltipHeader}>
        <div className={styles.tooltipLabel}>{dataPoint.dateLabel}</div>
        <button
          className={styles.tooltipCloseBtn}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <div className={styles.tooltipMeta}>
        {dayOfWeek} {yearShort}
      </div>

      {/* Activity links */}
      {dataPoint.activities.length > 0 && (
        <div className={styles.tooltipActivities}>
          {dataPoint.activities.map((activity) => (
            <div key={activity.id} className={styles.tooltipActivity}>
              <span className={styles.tooltipActivityName}>
                {activity.name}
              </span>
              <a
                href={`${STRAVA_ACTIVITY_URL}/${activity.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.viewOnStravaLink}
              >
                View on Strava
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Metrics */}
      {metrics.map((m) => {
        const config = METRICS[m.key];
        return (
          <div key={m.key} className={styles.tooltipItem}>
            <span
              className={styles.tooltipDot}
              style={{ backgroundColor: config.color }}
            />
            <span>
              {config.label}: {formatMetricValue(m.value, m.key)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface ActivityChartsProps {
  activities: Activity[];
  isLoading?: boolean;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  timeSpan?: TimeSpan;
  onTimeSpanChange?: (timeSpan: TimeSpan) => void;
}

// Custom tooltip component
function CustomTooltip({
  active,
  payload,
  isLocked = false,
}: {
  active?: boolean;
  payload?: Array<{
    dataKey: string;
    value: number;
    color: string;
    payload: { date: string; dateLabel: string; activities: ActivityInfo[] };
  }>;
  isLocked?: boolean;
}) {
  if (!active || !payload?.length) return null;

  // Filter out entries with 0 value (no activity)
  const nonZeroPayload = payload.filter((entry) => entry.value !== 0);

  // Don't show tooltip if all values are 0
  if (nonZeroPayload.length === 0) return null;

  // Get data from the first payload item
  const dataPoint = payload[0]?.payload;
  const dateStr = dataPoint?.date;
  const date = dateStr ? new Date(dateStr + "T12:00:00") : null;
  const activities = dataPoint?.activities || [];

  const dayOfWeek = date
    ? date.toLocaleDateString("en-US", { weekday: "long" })
    : "";
  const yearShort = date ? `'${date.getFullYear().toString().slice(-2)}` : "";
  const dateLabel = dataPoint?.dateLabel || "";

  return (
    <div
      className={`${styles.tooltip} ${isLocked ? styles.tooltipLocked : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.tooltipHeader}>
        <div className={styles.tooltipLabel}>{dateLabel}</div>
        {isLocked && (
          <span className={styles.tooltipLockBadge}>Click to close</span>
        )}
      </div>
      <div className={styles.tooltipMeta}>
        {dayOfWeek} {yearShort}
      </div>

      {/* Activity links */}
      {activities.length > 0 && (
        <div className={styles.tooltipActivities}>
          {activities.map((activity) => (
            <div key={activity.id} className={styles.tooltipActivity}>
              <span className={styles.tooltipActivityName}>
                {activity.name}
              </span>
              <a
                href={`${STRAVA_ACTIVITY_URL}/${activity.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.viewOnStravaLink}
                onClick={(e) => e.stopPropagation()}
              >
                View on Strava
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Metrics */}
      {nonZeroPayload.map((entry) => {
        const metricKey = entry.dataKey as MetricKey;
        const config = METRICS[metricKey];
        if (!config) return null;

        return (
          <div key={entry.dataKey} className={styles.tooltipItem}>
            <span
              className={styles.tooltipDot}
              style={{ backgroundColor: entry.color }}
            />
            <span>
              {config.label}: {formatMetricValue(entry.value, metricKey)}
            </span>
          </div>
        );
      })}

      {/* Hint to click */}
      {!isLocked && activities.length > 0 && (
        <div className={styles.tooltipHint}>Click dot to pin</div>
      )}
    </div>
  );
}

export function ActivityCharts({
  activities,
  isLoading = false,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  timeSpan: timeSpanProp,
  onTimeSpanChange,
}: ActivityChartsProps) {
  // State for controls - use internal state if no external control provided
  const [internalTimeSpan, setInternalTimeSpan] = useState<TimeSpan>("30d");
  const timeSpan = timeSpanProp ?? internalTimeSpan;
  const handleTimeSpanChange = onTimeSpanChange ?? setInternalTimeSpan;

  const [page, setPage] = useState(0);
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<
    string[] | null
  >(null);
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>([
    "distance",
  ]);

  // State for locked tooltip
  const [lockedTooltip, setLockedTooltip] = useState<{
    dataPoint: {
      date: string;
      dateLabel: string;
      activities: ActivityInfo[];
    };
    metrics: Array<{ key: MetricKey; value: number }>;
    position: { x: number; y: number };
  } | null>(null);

  // Get the history complete flag directly from the store
  const isFetchingComplete = useActivitiesStore(
    (state) => state.isFetchingComplete
  );

  // Fetch all activities when time span is "ytd" or "all"
  // Only if we haven't already fetched all historical data
  useEffect(() => {
    if (
      (timeSpan === "ytd" || timeSpan === "all") &&
      !isFetchingComplete &&
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
    isFetchingComplete,
  ]);

  // Get available activity types from the data
  const availableActivityTypes = useMemo(
    () => getUniqueActivityTypeGroups(activities),
    [activities]
  );

  // Effective selected types: use all available if not yet selected by user
  const effectiveSelectedTypes =
    selectedActivityTypes === null
      ? availableActivityTypes
      : selectedActivityTypes;

  // Calculate earliest activity date for "all" time span
  const earliestActivityDate = useMemo(() => {
    if (activities.length === 0) return undefined;
    return activities.reduce((earliest, activity) => {
      const date = new Date(activity.start_date_local);
      return date < earliest ? date : earliest;
    }, new Date());
  }, [activities]);

  // Process data for chart
  const chartData = useMemo(() => {
    // Get date range for current page
    const { start, end } = getDateRange(timeSpan, page, earliestActivityDate);

    // Filter by activity types
    let filtered = filterActivitiesByType(activities, effectiveSelectedTypes);

    // Filter by date range
    filtered = filterActivitiesByDateRange(filtered, start, end);

    // Aggregate by date (includes all days in range, even with no activities)
    return aggregateActivitiesByDate(
      filtered,
      selectedMetrics,
      timeSpan,
      start,
      end
    );
  }, [
    activities,
    timeSpan,
    page,
    effectiveSelectedTypes,
    selectedMetrics,
    earliestActivityDate,
  ]);

  // Determine if pagination is possible
  const canGoPrev = useMemo(() => {
    if (timeSpan === "all") return false;
    // Check if there's data in older periods
    const { start } = getDateRange(timeSpan, page + 1);
    const oldestActivity = activities.reduce((oldest, activity) => {
      const date = new Date(activity.start_date_local);
      return date < oldest ? date : oldest;
    }, new Date());
    return oldestActivity < start;
  }, [activities, timeSpan, page]);

  const canGoNext = page > 0;

  // Get date range label for display
  const dateRangeLabel = useMemo(() => {
    if (timeSpan === "all") return "All Time";
    const { start, end } = getDateRange(timeSpan, page);
    const formatDate = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${formatDate(start)} - ${formatDate(end)}`;
  }, [timeSpan, page]);

  // Handle time span change - reset page
  const onTimeSpanChangeWithReset = (newTimeSpan: TimeSpan) => {
    handleTimeSpanChange(newTimeSpan);
    setPage(0);
  };

  if (isLoading) {
    return (
      <Box className={styles.chartContainer}>
        <Heading size="4" mb="4">
          Activity Trends
        </Heading>
        <Flex align="center" justify="center" py="9">
          <Spinner size="3" />
          <Text ml="3" color="gray">
            Loading chart data...
          </Text>
        </Flex>
      </Box>
    );
  }

  console.log("chartData", chartData);

  return (
    <Box className={styles.chartContainer}>
      <Flex justify="between" align="center" mb="4">
        <Flex align="center" gap="2">
          <Heading size="4">Activity Trends</Heading>
          {isFetchingNextPage && (
            <Flex align="center" gap="1">
              <Spinner size="1" />
              <Text size="1" color="gray">
                Loading more...
              </Text>
            </Flex>
          )}
        </Flex>
        {timeSpan !== "all" && (
          <Text size="2" color="gray" className={styles.paginationInfo}>
            {dateRangeLabel}
          </Text>
        )}
      </Flex>

      <ChartControls
        timeSpan={timeSpan}
        onTimeSpanChange={onTimeSpanChangeWithReset}
        selectedActivityTypes={effectiveSelectedTypes}
        onActivityTypesChange={setSelectedActivityTypes}
        selectedMetrics={selectedMetrics}
        onMetricsChange={setSelectedMetrics}
        availableActivityTypes={availableActivityTypes}
        page={page}
        onPageChange={setPage}
        canGoNext={canGoNext}
        canGoPrev={canGoPrev}
      />

      <Box className={styles.chartWrapper}>
        {chartData.length === 0 ? (
          <div className={styles.emptyState}>
            <Text size="3" color="gray">
              No activities found for this period
            </Text>
            <Text size="2" color="gray" mt="1">
              Try adjusting your filters or time range
            </Text>
          </div>
        ) : (
          <>
            <div className={styles.chartAreaContainer}>
              {isFetchingNextPage && (
                <div className={styles.chartOverlay}>
                  <Spinner size="3" />
                </div>
              )}
              <div
                className={styles.chartArea}
                onClick={() => setLockedTooltip(null)}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--gray-a4)"
                    />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fontSize: 12, fill: "var(--gray-11)" }}
                      tickLine={{ stroke: "var(--gray-a6)" }}
                      axisLine={{ stroke: "var(--gray-a6)" }}
                    />
                    {/* Create a separate Y axis for each metric so each uses its own scale */}
                    {/* Only show the axis when a single metric is selected */}
                    {selectedMetrics.map((metric) => (
                      <YAxis
                        key={metric}
                        yAxisId={metric}
                        hide={selectedMetrics.length > 1}
                        tick={{ fontSize: 12, fill: "var(--gray-11)" }}
                        tickLine={{ stroke: "var(--gray-a6)" }}
                        axisLine={{ stroke: "var(--gray-a6)" }}
                        width={selectedMetrics.length > 1 ? 0 : 55}
                        domain={[0, "auto"]}
                        tickFormatter={(value: number) =>
                          METRICS[metric].format(value)
                        }
                      />
                    ))}
                    {!lockedTooltip && <Tooltip content={<CustomTooltip />} />}
                    {selectedMetrics.map((metric) => (
                      <Line
                        key={metric}
                        type="monotone"
                        dataKey={metric}
                        yAxisId={metric}
                        stroke={METRICS[metric].color}
                        strokeWidth={2}
                        dot={(props) => {
                          // Hide dot if value is 0 (no activity)
                          if (props.value === 0) return <g key={props.key} />;
                          return (
                            <circle
                              key={props.key}
                              cx={props.cx}
                              cy={props.cy}
                              r={3}
                              fill={METRICS[metric].color}
                            />
                          );
                        }}
                        activeDot={(props) => {
                          // Hide active dot if value is 0
                          if (props.value === 0) return <g key={props.key} />;
                          const dataPoint = props.payload as {
                            date: string;
                            dateLabel: string;
                            activities: ActivityInfo[];
                          };
                          return (
                            <circle
                              key={props.key}
                              cx={props.cx}
                              cy={props.cy}
                              r={6}
                              fill={METRICS[metric].color}
                              stroke={
                                lockedTooltip ? "var(--accent-9)" : "none"
                              }
                              strokeWidth={2}
                              style={{ cursor: "pointer" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (lockedTooltip) {
                                  setLockedTooltip(null);
                                } else {
                                  // Collect all metrics for this data point
                                  const rawData =
                                    dataPoint as unknown as Record<
                                      string,
                                      unknown
                                    >;
                                  const metrics = selectedMetrics
                                    .map((m) => ({
                                      key: m,
                                      value: (typeof rawData[m] === "number"
                                        ? rawData[m]
                                        : 0) as number,
                                    }))
                                    .filter((m) => m.value !== 0);

                                  setLockedTooltip({
                                    dataPoint,
                                    metrics,
                                    position: {
                                      x: props.cx ?? 0,
                                      y: props.cy ?? 0,
                                    },
                                  });
                                }
                              }}
                            />
                          );
                        }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>

                {/* Locked tooltip - rendered as overlay */}
                {lockedTooltip && (
                  <div
                    className={styles.lockedTooltipWrapper}
                    style={{
                      left: lockedTooltip.position.x,
                      top: lockedTooltip.position.y,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <LockedTooltipContent
                      dataPoint={lockedTooltip.dataPoint}
                      metrics={lockedTooltip.metrics}
                      onClose={() => setLockedTooltip(null)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Legend */}
            <div className={styles.legendContainer}>
              {selectedMetrics.map((metric) => (
                <div key={metric} className={styles.legendItem}>
                  <span
                    className={styles.legendDot}
                    style={{ backgroundColor: METRICS[metric].color }}
                  />
                  <span>
                    {METRICS[metric].label} ({METRICS[metric].unit})
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Box>
    </Box>
  );
}
