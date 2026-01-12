import { Outlet, useNavigate } from "react-router";
import { useEffect } from "react";
import { Container, Flex, Heading, Skeleton, Box } from "@radix-ui/themes";
import { AuthButton } from "../AuthButton";
import { useAuthStore } from "../../stores/authStore";
import { useAthlete } from "../../hooks/useAthlete";
import styles from "./Layout.module.css";

interface LayoutProps {
  /**
   * If true, only shows header skeleton during initial load
   * Used for pages that want to handle their own loading states
   */
  showLoadingSkeleton?: boolean;
}

export function Layout({ showLoadingSkeleton = true }: LayoutProps) {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  // Fetch athlete data to check auth status
  const { isLoading: athleteLoading, isError: athleteError } = useAthlete();

  const isLoading = authLoading || athleteLoading;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading && showLoadingSkeleton) {
    return (
      <Box className={styles.page}>
        <header className={styles.header}>
          <Container size="4">
            <Flex justify="between" align="center" py="4">
              <Heading size="5" className={styles.headerTitle}>
                Dashy
              </Heading>
              <Skeleton height="32px" width="100px" />
            </Flex>
          </Container>
        </header>
        <main className={styles.main}>
          <Container size="4" className={styles.container}>
            <Skeleton height="400px" style={{ marginTop: "1.5rem" }} />
          </Container>
        </main>
        <footer className={styles.footer}>
          <Container size="4">
            <Flex justify="center" align="center" py="4">
              <Skeleton height="12px" width="120px" />
            </Flex>
          </Container>
        </footer>
      </Box>
    );
  }

  if (athleteError || !isAuthenticated) {
    return null; // Will redirect via useEffect
  }

  return (
    <Box className={styles.page}>
      <header className={styles.header}>
        <Container size="4">
          <Flex justify="between" align="center" py="4">
            <Heading size="5" className={styles.headerTitle}>
              Dashy
            </Heading>
            <AuthButton />
          </Flex>
        </Container>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>

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
