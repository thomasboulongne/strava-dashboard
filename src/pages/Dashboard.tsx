import { useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Container,
  Flex,
  Heading,
  Text,
  Skeleton,
  Box,
  Separator,
} from "@radix-ui/themes";
import { AuthButton } from "../components/AuthButton";
import { SyncStatus } from "../components/SyncStatus";
import { ActivityCharts } from "../components/ActivityCharts";
import {
  WeeklyVolumeChart,
  ConsistencyHeatmap,
  LongRideProgressionChart,
  DurationDistributionChart,
  PaceSpeedTrendChart,
  ClimbingFocusChart,
  AcuteChronicLoadChart,
  TopRoutesChart,
} from "../components/AnalyticsCharts";
import {
  DashboardSkeleton,
  ChartCardSkeleton,
  HeatmapSkeleton,
} from "../components/Skeletons";
import { useAuthStore } from "../stores/authStore";
import { useAthlete } from "../hooks/useAthlete";
import { useAthleteStats } from "../hooks/useAthleteStats";
import { useActivities } from "../hooks/useActivities";
import styles from "./Dashboard.module.css";

// Strava API maximum per_page limit - fetch more for analytics charts
const STRAVA_PER_PAGE = 200;

export function Dashboard() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, athlete } = useAuthStore();

  // Fetch athlete data to check auth status
  const { isLoading: athleteLoading, isError: athleteError } = useAthlete();

  // Fetch stats and activities when authenticated
  const { data: stats, isLoading: statsLoading } = useAthleteStats(athlete?.id);
  const {
    data: activitiesData,
    isLoading: activitiesLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useActivities(STRAVA_PER_PAGE);

  const isLoading = authLoading || athleteLoading;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <Box className={styles.page}>
        <header className={styles.header}>
          <Container size="4">
            <Flex justify="between" align="center" py="4">
              <Heading size="5">Dashy</Heading>
              <Skeleton height="32px" width="100px" />
            </Flex>
          </Container>
        </header>
        <Container size="4" className={styles.container}>
          <DashboardSkeleton />
        </Container>
      </Box>
    );
  }

  if (athleteError || !isAuthenticated) {
    return null; // Will redirect via useEffect
  }

  // Flatten paginated activities
  const activities = activitiesData?.pages.flat() ?? [];

  return (
    <Box className={styles.page}>
      <header className={styles.header}>
        <Container size="4">
          <Flex justify="between" align="center" py="4">
            <Heading size="5">Dashy</Heading>
            <AuthButton />
          </Flex>
        </Container>
      </header>

      <Container size="4" className={styles.container}>
        <Flex direction="column" gap="6" py="6">
          <Box>
            <Flex justify="between" align="start">
              <Box>
                <Heading size="6" mb="2">
                  Welcome back, {athlete?.firstname}!
                </Heading>
                <Text color="gray">
                  Here's your activity overview. Customize this dashboard to
                  display your stats however you'd like.
                </Text>
              </Box>
              <SyncStatus />
            </Flex>
          </Box>

          <Separator size="4" />

          {/* Placeholder sections for data display */}
          <Box className={styles.section}>
            <Heading size="4" mb="4">
              Stats Overview
            </Heading>
            {statsLoading ? (
              <div className={styles.statsGrid}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className={styles.statCard}>
                    <Skeleton height="14px" width="80px" mb="2" />
                    <Skeleton height="32px" width="60px" />
                  </div>
                ))}
              </div>
            ) : stats ? (
              <Box className={styles.placeholder}>
                <Text color="gray" size="2">
                  Stats data is available! Add your custom visualization here.
                </Text>
                <Text
                  size="1"
                  color="gray"
                  style={{ fontFamily: "monospace", marginTop: "8px" }}
                >
                  YTD Runs: {stats.ytd_run_totals.count} | YTD Rides:{" "}
                  {stats.ytd_ride_totals.count}
                </Text>
              </Box>
            ) : (
              <Text color="gray">No stats available</Text>
            )}
          </Box>

          <Separator size="4" />

          {/* Original Activity Trends Chart */}
          <ActivityCharts
            activities={activities}
            isLoading={activitiesLoading}
            fetchNextPage={fetchNextPage}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
          />
          <Separator size="4" />

          {/* Analytics Charts Grid */}
          <Box>
            <Heading size="4" mb="4">
              Analytics
            </Heading>

            {activitiesLoading ? (
              <div className={styles.analyticsGrid}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <ChartCardSkeleton key={i} />
                ))}
                <div className={styles.fullWidth}>
                  <HeatmapSkeleton />
                </div>
                <ChartCardSkeleton />
              </div>
            ) : (
              <div className={styles.analyticsGrid}>
                <WeeklyVolumeChart
                  activities={activities}
                  fetchNextPage={fetchNextPage}
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                />
                <LongRideProgressionChart
                  activities={activities}
                  fetchNextPage={fetchNextPage}
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                />
                <DurationDistributionChart
                  activities={activities}
                  fetchNextPage={fetchNextPage}
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                />
                <PaceSpeedTrendChart
                  activities={activities}
                  fetchNextPage={fetchNextPage}
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                />
                <ClimbingFocusChart
                  activities={activities}
                  fetchNextPage={fetchNextPage}
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                />
                <AcuteChronicLoadChart
                  activities={activities}
                  fetchNextPage={fetchNextPage}
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                />
                <div className={styles.fullWidth}>
                  <ConsistencyHeatmap
                    activities={activities}
                    fetchNextPage={fetchNextPage}
                    hasNextPage={hasNextPage}
                    isFetchingNextPage={isFetchingNextPage}
                  />
                </div>
                <TopRoutesChart
                  activities={activities}
                  fetchNextPage={fetchNextPage}
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                />
              </div>
            )}
          </Box>

          <Separator size="4" />
        </Flex>
      </Container>

      <footer className={styles.footer}>
        <Container size="4">
          <Flex justify="center" align="center" py="4">
            <a
              href="https://www.strava.com"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.poweredByLink}
            >
              <img
                src="/api_logo_pwrdBy_strava_horiz_orange.svg"
                alt="Powered by Strava"
                height="24"
              />
            </a>
          </Flex>
        </Container>
      </footer>
    </Box>
  );
}
