import { Button, Avatar, Flex, Text } from "@radix-ui/themes";
import { useAuthStore } from "../stores/authStore";
import { getAuthUrl } from "../lib/api";
import styles from "./AuthButton.module.css";

export function AuthButton() {
  const { isAuthenticated, isLoading, athlete } = useAuthStore();

  const handleLogin = async () => {
    try {
      const { url } = await getAuthUrl();
      window.location.href = url;
    } catch (error) {
      console.error("Failed to get auth URL:", error);
    }
  };

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  if (isLoading) {
    return (
      <Button disabled variant="soft">
        Loading...
      </Button>
    );
  }

  if (isAuthenticated && athlete) {
    return (
      <Flex align="center" gap="3">
        <Flex align="center" gap="2">
          <Avatar
            src={athlete.profile}
            fallback={`${athlete.firstname[0]}${athlete.lastname[0]}`}
            size="2"
            radius="full"
          />
          <Text size="2" weight="medium">
            {athlete.firstname} {athlete.lastname}
          </Text>
        </Flex>
        <Button variant="soft" color="gray" onClick={handleLogout}>
          Logout
        </Button>
      </Flex>
    );
  }

  return (
    <Button
      className={styles.stravaButton}
      onClick={handleLogin}
      size="3"
    >
      <svg
        className={styles.stravaLogo}
        viewBox="0 0 24 24"
        fill="currentColor"
        width="20"
        height="20"
      >
        <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
      </svg>
      Connect with Strava
    </Button>
  );
}

