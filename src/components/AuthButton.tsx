import { Avatar, Flex, Text, Button } from "@radix-ui/themes";
import { Link, useLocation } from "react-router";
import { useAuthStore } from "../stores/authStore";
import { getAuthUrl } from "../lib/api";
import styles from "./AuthButton.module.css";

export function AuthButton() {
  const { isAuthenticated, isLoading, athlete } = useAuthStore();
  const location = useLocation();

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
      <Flex align="center" justify="between" gap="3" width="100%">
        {/* Navigation Links */}
        <Flex gap="2">
          <Link
            to="/dashboard"
            className={`${styles.navLink} ${
              location.pathname === "/dashboard" ? styles.navLinkActive : ""
            }`}
          >
            Dashboard
          </Link>
          <Link
            to="/plan"
            className={`${styles.navLink} ${
              location.pathname === "/plan" ? styles.navLinkActive : ""
            }`}
          >
            Training Plan
          </Link>
        </Flex>

        <Flex align="end" gap="2">
          <Flex align="center" gap="2">
            <Avatar
              src={athlete.profile}
              fallback={`${athlete.firstname[0]}${athlete.lastname[0]}`}
              size="2"
              radius="full"
            />
            <Text size="2" weight="medium" className={styles.athleteName}>
              {athlete.firstname} {athlete.lastname}
            </Text>
          </Flex>
          <Button variant="soft" color="gray" onClick={handleLogout}>
            Logout
          </Button>
        </Flex>
      </Flex>
    );
  }

  return (
    <button
      className={styles.stravaConnectButton}
      onClick={handleLogin}
      type="button"
      aria-label="Connect with Strava"
    >
      <img
        src="/btn_strava_connectwith_orange.svg"
        alt="Connect with Strava"
        height="48"
      />
    </button>
  );
}
