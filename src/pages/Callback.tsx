import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Container, Flex, Spinner, Text } from "@radix-ui/themes";
import styles from "./Callback.module.css";

export function Callback() {
  const navigate = useNavigate();

  useEffect(() => {
    // The actual OAuth callback is handled by the Netlify function
    // which sets cookies and redirects to /dashboard.
    // This page only shows if something goes wrong with the redirect.
    const timer = setTimeout(() => {
      navigate("/");
    }, 5000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <Container size="2" className={styles.container}>
      <Flex direction="column" align="center" justify="center" gap="4">
        <Spinner size="3" />
        <Text size="3" color="gray">
          Completing authentication...
        </Text>
      </Flex>
    </Container>
  );
}

