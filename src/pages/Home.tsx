import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Container, Flex, Text, Callout, Spinner } from "@radix-ui/themes";
import { AuthButton } from "../components/AuthButton";
import { useAuthStore } from "../stores/authStore";
import { getStoredSession, useAuthRecovery } from "../hooks/useSessionCapture";
import styles from "./Home.module.css";

export function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading } = useAuthStore();
  const { recovering } = useAuthRecovery();

  const error = searchParams.get("error");

  useEffect(() => {
    if (recovering) return;

    if (isAuthenticated && !isLoading) {
      navigate("/dashboard");
      return;
    }

    const session = getStoredSession();
    if (session && !isLoading) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, isLoading, recovering, navigate]);

  // Keep showing the spinner while we have any reason to believe the user
  // might be authenticated.  This prevents the login page from flashing
  // in the frame between recovery completing and the navigate() firing.
  const pendingRedirect =
    recovering || isAuthenticated || !!getStoredSession();

  if (pendingRedirect) {
    return (
      <Container size="2" className={styles.container}>
        <Flex
          direction="column"
          align="center"
          justify="center"
          gap="4"
          className={styles.content}
        >
          <div className={styles.logoContainer}>
            <img src="/dashyLogo.svg" alt="Dashy" className={styles.logo} />
          </div>
          <Spinner size="3" />
        </Flex>
      </Container>
    );
  }

  return (
    <Container size="2" className={styles.container}>
      <Flex
        direction="column"
        align="center"
        justify="center"
        gap="6"
        className={styles.content}
      >
        <Flex direction="column" align="center" gap="3">
          <div className={styles.logoContainer}>
            <img src="/dashyLogo.svg" alt="Dashy" className={styles.logo} />
          </div>
          {/* <Heading size="8" align="center">
            Dashy
          </Heading> */}
          <Text size="4" color="gray" align="center">
            View your activity stats in a beautiful dashboard
          </Text>
        </Flex>

        {error && (
          <Callout.Root color="red" className={styles.error}>
            <Callout.Text>
              {error === "access_denied"
                ? "You denied access to your Strava account."
                : "Authentication failed. Please try again."}
            </Callout.Text>
          </Callout.Root>
        )}

        <AuthButton />

        <Text
          size="2"
          color="gray"
          align="center"
          className={styles.disclaimer}
        >
          We only read your activity data. Your information is never stored on
          our servers.
        </Text>
      </Flex>
    </Container>
  );
}
