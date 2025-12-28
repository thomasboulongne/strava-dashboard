import { Skeleton, Box, Flex } from "@radix-ui/themes";
import styles from "./Skeletons.module.css";

/**
 * Skeleton for a single chart card matching ChartCard layout
 */
export function ChartCardSkeleton() {
  return (
    <div className={styles.chartCard}>
      {/* Header */}
      <div className={styles.chartHeader}>
        <div>
          <Skeleton height="18px" width="140px" />
          <Skeleton height="14px" width="200px" mt="1" />
        </div>
        <Skeleton height="28px" width="120px" />
      </div>

      {/* Chart area simulation */}
      <div className={styles.chartContent}>
        <div className={styles.chartBars}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton
              key={i}
              className={styles.chartBar}
              style={{
                height: `${30 + Math.random() * 60}%`,
                animationDelay: `${i * 50}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for the Activity Trends chart (larger format)
 */
export function ActivityChartSkeleton() {
  return (
    <Box className={styles.activityChart}>
      {/* Title and date range */}
      <Flex justify="between" align="center" mb="4">
        <Skeleton height="24px" width="150px" />
        <Skeleton height="18px" width="120px" />
      </Flex>

      {/* Controls bar */}
      <Flex gap="3" mb="4" wrap="wrap">
        <Skeleton height="32px" width="140px" />
        <Skeleton height="32px" width="180px" />
        <Skeleton height="32px" width="160px" />
        <Flex gap="2" ml="auto">
          <Skeleton height="32px" width="32px" />
          <Skeleton height="32px" width="32px" />
        </Flex>
      </Flex>

      {/* Chart area */}
      <div className={styles.lineChartArea}>
        {/* Y-axis labels */}
        <div className={styles.yAxis}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="12px" width="40px" />
          ))}
        </div>

        {/* Main chart lines */}
        <div className={styles.lineChartContent}>
          <svg className={styles.lineSvg} viewBox="0 0 100 100" preserveAspectRatio="none">
            <path
              className={styles.skeletonLine}
              d="M0,70 Q10,60 20,65 T40,50 T60,55 T80,40 T100,45"
            />
          </svg>
          <div className={styles.gridLines}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={styles.gridLine} />
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

      {/* Legend */}
      <Flex gap="4" justify="center" mt="3" pt="3" className={styles.legend}>
        <Flex align="center" gap="2">
          <Skeleton height="8px" width="8px" style={{ borderRadius: "50%" }} />
          <Skeleton height="12px" width="80px" />
        </Flex>
      </Flex>
    </Box>
  );
}

/**
 * Skeleton for the stats overview section
 */
export function StatsOverviewSkeleton() {
  return (
    <div className={styles.statsSection}>
      <Skeleton height="20px" width="120px" mb="4" />
      <div className={styles.statsGrid}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.statCard}>
            <Skeleton height="14px" width="80px" mb="2" />
            <Skeleton height="32px" width="60px" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for the analytics grid (multiple chart cards)
 */
export function AnalyticsGridSkeleton() {
  return (
    <Box>
      <Skeleton height="24px" width="100px" mb="4" />
      <div className={styles.analyticsGrid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <ChartCardSkeleton key={i} />
        ))}
        {/* Full-width heatmap skeleton */}
        <div className={styles.fullWidth}>
          <HeatmapSkeleton />
        </div>
        <ChartCardSkeleton />
      </div>
    </Box>
  );
}

/**
 * Skeleton for the consistency heatmap
 */
export function HeatmapSkeleton() {
  return (
    <div className={styles.chartCard}>
      {/* Header */}
      <div className={styles.chartHeader}>
        <div>
          <Skeleton height="18px" width="180px" />
          <Skeleton height="14px" width="240px" mt="1" />
        </div>
        <Skeleton height="28px" width="120px" />
      </div>

      {/* Heatmap grid */}
      <div className={styles.heatmapContent}>
        <div className={styles.heatmapGrid}>
          {Array.from({ length: 52 }).map((_, weekIndex) => (
            <div key={weekIndex} className={styles.heatmapWeek}>
              {Array.from({ length: 7 }).map((_, dayIndex) => (
                <Skeleton
                  key={dayIndex}
                  className={styles.heatmapCell}
                  style={{ animationDelay: `${(weekIndex + dayIndex) * 5}ms` }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for the welcome header section
 */
export function WelcomeHeaderSkeleton() {
  return (
    <Box>
      <Flex align="center" gap="2" mb="2">
        <Skeleton height="28px" width="250px" />
      </Flex>
      <Skeleton height="18px" width="400px" />
    </Box>
  );
}

/**
 * Full dashboard skeleton - used for initial page load
 */
export function DashboardSkeleton() {
  return (
    <Flex direction="column" gap="6" py="6">
      <WelcomeHeaderSkeleton />
      <div className={styles.separator} />
      <StatsOverviewSkeleton />
      <div className={styles.separator} />
      <ActivityChartSkeleton />
      <div className={styles.separator} />
      <AnalyticsGridSkeleton />
    </Flex>
  );
}

