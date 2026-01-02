import { useState, useMemo, useRef } from "react";
import { Box, Heading, Flex, Text, Skeleton } from "@radix-ui/themes";
import {
  BarChart,
  Bar,
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
  filterActivitiesBySportType,
  filterActivitiesByDateRange,
  aggregateActivitiesByDate,
  getUniqueSportTypes,
  formatMetricValue,
} from "../../lib/chart-utils";
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
  // Kept for backward compatibility but no longer used
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
  coordinate,
  isLocked = false,
  onPositionChange,
}: {
  active?: boolean;
  payload?: Array<{
    dataKey: string;
    value: number;
    color: string;
    payload: { date: string; dateLabel: string; activities: ActivityInfo[] };
  }>;
  coordinate?: { x: number; y: number };
  isLocked?: boolean;
  onPositionChange?: (position: { x: number; y: number }) => void;
}) {
  if (!active || !payload?.length) return null;

  // Track tooltip position when it changes
  if (coordinate && onPositionChange) {
    onPositionChange(coordinate);
  }

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
    </div>
  );
}

export function ActivityCharts({
  activities,
  isLoading = false,
  // Kept for backward compatibility but no longer used
  fetchNextPage: _fetchNextPage,
  hasNextPage: _hasNextPage,
  isFetchingNextPage: _isFetchingNextPage,
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
    "moving_time",
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

  // Ref to track last tooltip position from Recharts
  const lastTooltipPosition = useRef<{ x: number; y: number }>({
    x: 200,
    y: 100,
  });

  // Get available activity types from the data
  const availableActivityTypes = useMemo(
    () => getUniqueSportTypes(activities),
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

    // Filter by activity sport types
    let filtered = filterActivitiesBySportType(
      activities,
      effectiveSelectedTypes
    );

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
    const sameYear = start.getFullYear() === end.getFullYear();
    const formatDateWithYear = (d: Date) =>
      d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    const formatDateNoYear = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    if (sameYear) {
      return `${formatDateNoYear(start)} - ${formatDateWithYear(end)}`;
    }
    return `${formatDateWithYear(start)} - ${formatDateWithYear(end)}`;
  }, [timeSpan, page]);

  // Handle time span change - reset page
  const onTimeSpanChangeWithReset = (newTimeSpan: TimeSpan) => {
    handleTimeSpanChange(newTimeSpan);
    setPage(0);
  };

  if (isLoading) {
    return (
      <Box className={styles.chartContainer}>
        <Flex justify="between" align="center" mb="4">
          <Skeleton height="24px" width="150px" />
          <Skeleton height="18px" width="120px" />
        </Flex>

        {/* Controls skeleton */}
        <Flex gap="3" mb="4" wrap="wrap">
          <Skeleton height="32px" width="140px" />
          <Skeleton height="32px" width="180px" />
          <Skeleton height="32px" width="160px" />
          <Flex gap="2" ml="auto">
            <Skeleton height="32px" width="32px" />
            <Skeleton height="32px" width="32px" />
          </Flex>
        </Flex>

        {/* Chart area skeleton */}
        <Box className={styles.chartWrapper}>
          <div className={styles.skeletonChartArea}>
            {/* Y-axis labels */}
            <div className={styles.skeletonYAxis}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} height="12px" width="40px" />
              ))}
            </div>

            {/* Chart content with animated bars */}
            <div className={styles.skeletonChartContent}>
              <div className={styles.skeletonBars}>
                {[45, 70, 55, 80, 40, 65, 75, 50, 60, 35, 85, 55].map(
                  (height, i) => (
                    <div
                      key={i}
                      className={styles.skeletonBar}
                      style={{ height: `${height}%` }}
                    />
                  )
                )}
              </div>
              <div className={styles.skeletonGridLines}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className={styles.skeletonGridLine} />
                ))}
              </div>
            </div>
          </div>

          {/* X-axis labels */}
          <Flex justify="between" mt="2" px="6">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} height="12px" width="30px" />
            ))}
          </Flex>

          {/* Legend skeleton */}
          <div className={styles.legendContainer}>
            <Flex align="center" gap="2">
              <Skeleton
                height="8px"
                width="8px"
                style={{ borderRadius: "50%" }}
              />
              <Skeleton height="12px" width="100px" />
            </Flex>
          </div>
        </Box>
      </Box>
    );
  }

  return (
    <Box className={styles.chartContainer}>
      <Flex justify="between" align="center" mb="4">
        <Heading size="4">Activity Trends</Heading>
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
              <div
                className={styles.chartArea}
                onClick={() => setLockedTooltip(null)}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    barCategoryGap="15%"
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--gray-a4)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fontSize: 11, fill: "var(--gray-11)" }}
                      tickLine={{ stroke: "var(--gray-a6)" }}
                      axisLine={{ stroke: "var(--gray-a6)" }}
                      interval="preserveStartEnd"
                    />
                    {/* Create a separate Y axis for each metric so each uses its own scale */}
                    {/* Only show the axis when a single metric is selected */}
                    {selectedMetrics.map((metric) => (
                      <YAxis
                        key={metric}
                        yAxisId={metric}
                        hide={selectedMetrics.length > 1}
                        tick={{ fontSize: 11, fill: "var(--gray-11)" }}
                        tickLine={{ stroke: "var(--gray-a6)" }}
                        axisLine={{ stroke: "var(--gray-a6)" }}
                        width={selectedMetrics.length > 1 ? 0 : 55}
                        domain={[0, "auto"]}
                        tickFormatter={(value: number) =>
                          METRICS[metric].format(value)
                        }
                      />
                    ))}
                    {!lockedTooltip && (
                      <Tooltip
                        content={
                          <CustomTooltip
                            onPositionChange={(pos) => {
                              lastTooltipPosition.current = pos;
                            }}
                          />
                        }
                        cursor={{ fill: "var(--gray-a3)" }}
                      />
                    )}
                    {selectedMetrics.map((metric) => (
                      <Bar
                        key={metric}
                        dataKey={metric}
                        yAxisId={metric}
                        fill={METRICS[metric].color}
                        radius={[3, 3, 0, 0]}
                        onClick={(data, _index, event) => {
                          // Stop propagation to prevent chartArea onClick from clearing tooltip
                          event.stopPropagation();

                          const rawData = data as unknown as Record<
                            string,
                            unknown
                          >;
                          if (!rawData || rawData[metric] === 0) return;
                          const dataPoint = rawData as unknown as {
                            date: string;
                            dateLabel: string;
                            activities: ActivityInfo[];
                          };

                          if (lockedTooltip) {
                            setLockedTooltip(null);
                          } else {
                            const metrics = selectedMetrics
                              .map((m) => ({
                                key: m,
                                value: (typeof rawData[m] === "number"
                                  ? rawData[m]
                                  : 0) as number,
                              }))
                              .filter((m) => m.value !== 0);

                            // Use the position from the hover tooltip
                            setLockedTooltip({
                              dataPoint,
                              metrics,
                              position: { ...lastTooltipPosition.current },
                            });
                          }
                        }}
                        style={{ cursor: "pointer" }}
                      />
                    ))}
                  </BarChart>
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
