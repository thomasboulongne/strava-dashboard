import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Container, Flex, Heading, Text, Callout } from "@radix-ui/themes";
import { AuthButton } from "../components/AuthButton";
import { useAuthStore } from "../stores/authStore";
import styles from "./Home.module.css";

export function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading } = useAuthStore();

  const error = searchParams.get("error");

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <Container size="2" className={styles.container}>
      <Flex direction="column" align="center" justify="center" gap="6" className={styles.content}>
        <Flex direction="column" align="center" gap="3">
          <div className={styles.logoContainer}>
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className={styles.logo}
            >
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
          </div>
          <Heading size="8" align="center">
            Strava Dashboard
          </Heading>
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

        <Text size="2" color="gray" align="center" className={styles.disclaimer}>
          We only read your activity data. Your information is never stored on our servers.
        </Text>
      </Flex>
    </Container>
  );
}

