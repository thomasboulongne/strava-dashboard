import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  Container,
  Flex,
  Heading,
  Text,
  Spinner,
  Box,
  Separator,
} from "@radix-ui/themes";
import { AuthButton } from "../components/AuthButton";
import { ActivityCharts } from "../components/ActivityCharts";
import { useAuthStore } from "../stores/authStore";
import { useAthlete } from "../hooks/useAthlete";
import { useAthleteStats } from "../hooks/useAthleteStats";
import { useActivities } from "../hooks/useActivities";
import type { TimeSpan } from "../lib/chart-utils";
import styles from "./Dashboard.module.css";

// Strava API maximum per_page limit
const STRAVA_MAX_PER_PAGE = 200;

// Calculate perPage based on time span (days * 1.1, min 30, max 200)
function getPerPageForTimeSpan(timeSpan: TimeSpan): number {
  const daysMap: Record<TimeSpan, number> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    ytd: 365,
    all: 200,
  };
  const days = daysMap[timeSpan];
  const calculated = Math.ceil(days * 1.1);
  return Math.min(STRAVA_MAX_PER_PAGE, Math.max(30, calculated));
}

export function Dashboard() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, athlete } = useAuthStore();

  // Time span state lifted from ActivityCharts for dynamic fetch sizing
  const [timeSpan, setTimeSpan] = useState<TimeSpan>("30d");

  // Calculate perPage based on time span
  const perPage = useMemo(() => getPerPageForTimeSpan(timeSpan), [timeSpan]);

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
  } = useActivities(perPage);

  const isLoading = authLoading || athleteLoading;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <Container size="4" className={styles.container}>
        <Flex
          direction="column"
          align="center"
          justify="center"
          gap="4"
          className={styles.loading}
        >
          <Spinner size="3" />
          <Text color="gray">Loading your data...</Text>
        </Flex>
      </Container>
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
            <Heading size="5">Strava Dashboard</Heading>
            <AuthButton />
          </Flex>
        </Container>
      </header>

      <Container size="4" className={styles.container}>
        <Flex direction="column" gap="6" py="6">
          <Box>
            <Heading size="6" mb="2">
              Welcome back, {athlete?.firstname}!
            </Heading>
            <Text color="gray">
              Here's your activity overview. Customize this dashboard to display
              your stats however you'd like.
            </Text>
          </Box>

          <Separator size="4" />

          {/* Placeholder sections for data display */}
          <Box className={styles.section}>
            <Heading size="4" mb="4">
              Stats Overview
            </Heading>
            {statsLoading ? (
              <Flex align="center" gap="2">
                <Spinner size="2" />
                <Text color="gray">Loading stats...</Text>
              </Flex>
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

          {/* Activity Charts */}
          <ActivityCharts
            activities={activities}
            isLoading={activitiesLoading}
            fetchNextPage={fetchNextPage}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            timeSpan={timeSpan}
            onTimeSpanChange={setTimeSpan}
          />
        </Flex>
      </Container>
    </Box>
  );
}
