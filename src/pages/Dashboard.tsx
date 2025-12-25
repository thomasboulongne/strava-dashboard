import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Container, Flex, Heading, Text, Spinner, Box, Separator } from "@radix-ui/themes";
import { AuthButton } from "../components/AuthButton";
import { useAuthStore } from "../stores/authStore";
import { useAthlete } from "../hooks/useAthlete";
import { useAthleteStats } from "../hooks/useAthleteStats";
import { useActivities } from "../hooks/useActivities";
import styles from "./Dashboard.module.css";

export function Dashboard() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, athlete } = useAuthStore();

  // Fetch athlete data to check auth status
  const { isLoading: athleteLoading, isError: athleteError } = useAthlete();

  // Fetch stats and activities when authenticated
  const { data: stats, isLoading: statsLoading } = useAthleteStats(athlete?.id);
  const { data: activitiesData, isLoading: activitiesLoading } = useActivities();

  const isLoading = authLoading || athleteLoading;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <Container size="4" className={styles.container}>
        <Flex direction="column" align="center" justify="center" gap="4" className={styles.loading}>
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
              Here's your activity overview. Customize this dashboard to display your stats however you'd like.
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
                <Text size="1" color="gray" style={{ fontFamily: "monospace", marginTop: "8px" }}>
                  YTD Runs: {stats.ytd_run_totals.count} | YTD Rides: {stats.ytd_ride_totals.count}
                </Text>
              </Box>
            ) : (
              <Text color="gray">No stats available</Text>
            )}
          </Box>

          <Separator size="4" />

          <Box className={styles.section}>
            <Heading size="4" mb="4">
              Recent Activities
            </Heading>
            {activitiesLoading ? (
              <Flex align="center" gap="2">
                <Spinner size="2" />
                <Text color="gray">Loading activities...</Text>
              </Flex>
            ) : activities.length > 0 ? (
              <Box className={styles.placeholder}>
                <Text color="gray" size="2">
                  Activities data is available! Add your custom list/cards here.
                </Text>
                <Text size="1" color="gray" style={{ fontFamily: "monospace", marginTop: "8px" }}>
                  Loaded {activities.length} activities
                </Text>
              </Box>
            ) : (
              <Text color="gray">No activities found</Text>
            )}
          </Box>
        </Flex>
      </Container>
    </Box>
  );
}

