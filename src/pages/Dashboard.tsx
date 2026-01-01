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
  HRZoneDistributionChart,
  HRZonePieChart,
  PowerZoneChart,
  TrainingIntensityChart,
  HRTrendChart,
} from "../components/AnalyticsCharts";
import {
  DashboardSkeleton,
  ChartCardSkeleton,
  HeatmapSkeleton,
} from "../components/Skeletons";
import { StatsOverview } from "../components/StatsOverview";
import { useAuthStore } from "../stores/authStore";
import { useAthlete } from "../hooks/useAthlete";
import { useAthleteStats } from "../hooks/useAthleteStats";
import { useActivities } from "../hooks/useActivities";
import { useAthleteZones } from "../hooks/useAthleteZones";
import { useActivityStreams } from "../hooks/useActivityStreams";
import styles from "./Dashboard.module.css";

// Strava API maximum per_page limit - fetch more for analytics charts
const STRAVA_PER_PAGE = 200;

export function Dashboard() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, athlete } = useAuthStore();

  // Fetch athlete data to check auth status
  const {
    data: athleteData,
    isLoading: athleteLoading,
    isError: athleteError,
  } = useAthlete();

  // Fetch stats and activities when authenticated
  const { data: stats, isLoading: statsLoading } = useAthleteStats(athlete?.id);
  const {
    data: activitiesData,
    isLoading: activitiesLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useActivities(STRAVA_PER_PAGE);

  // Fetch athlete zones and activity streams for HR/power charts
  const { data: zonesData, isLoading: zonesLoading } = useAthleteZones();
  const { data: streamsData, isLoading: streamsLoading } = useActivityStreams();

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

  // Extract zones and streams data
  const zones = zonesData?.zones ?? null;
  const streamsMap = streamsData?.streams ?? {};

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

          {/* Stats Overview Section */}
          <Box className={styles.section}>
            <Heading size="4" mb="4">
              Stats Overview
            </Heading>
            <StatsOverview
              athlete={athleteData ?? null}
              stats={stats ?? null}
              isLoading={statsLoading || athleteLoading}
            />
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
                {Array.from({ length: 8 }).map((_, i) => (
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
                <TrainingIntensityChart
                  activities={activities}
                  streamsMap={streamsMap}
                  zones={zones}
                  isLoading={zonesLoading || streamsLoading}
                  fetchNextPage={fetchNextPage}
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                />
                <HRZoneDistributionChart
                  activities={activities}
                  streamsMap={streamsMap}
                  zones={zones}
                  isLoading={zonesLoading || streamsLoading}
                  fetchNextPage={fetchNextPage}
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                />
                <HRZonePieChart
                  activities={activities}
                  streamsMap={streamsMap}
                  zones={zones}
                  isLoading={zonesLoading || streamsLoading}
                  fetchNextPage={fetchNextPage}
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                />
                <HRTrendChart
                  activities={activities}
                  streamsMap={streamsMap}
                  zones={zones}
                  isLoading={zonesLoading || streamsLoading}
                  fetchNextPage={fetchNextPage}
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                />
                <PowerZoneChart
                  activities={activities}
                  streamsMap={streamsMap}
                  zones={zones}
                  isLoading={zonesLoading || streamsLoading}
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
