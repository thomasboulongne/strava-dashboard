import { useEffect, useState } from "react";
import {
  Container,
  Flex,
  Box,
  Heading,
  Text,
  Button,
  Card,
  Code,
  Callout,
  Separator,
  IconButton,
  Skeleton,
  Tooltip,
} from "@radix-ui/themes";
import {
  FiCopy,
  FiCheck,
  FiTrash2,
  FiPlus,
  FiAlertTriangle,
} from "react-icons/fi";
import {
  getMcpKeys,
  createMcpKey,
  revokeMcpKey,
  type McpApiKey,
} from "../lib/api";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — ignore.
    }
  };

  return (
    <Tooltip content={copied ? "Copied!" : "Copy"}>
      <IconButton
        variant="soft"
        color={copied ? "green" : "gray"}
        onClick={handleCopy}
        aria-label="Copy connector URL"
      >
        {copied ? <FiCheck /> : <FiCopy />}
      </IconButton>
    </Tooltip>
  );
}

export function Settings() {
  const [keys, setKeys] = useState<McpApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getMcpKeys()
      .then((res) => {
        if (active) setKeys(res.keys);
      })
      .catch((err) => {
        if (active) setError(err?.message ?? "Failed to load keys");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const res = await createMcpKey();
      setKeys((prev) => [res.key, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (key: string) => {
    setError(null);
    try {
      await revokeMcpKey(key);
      setKeys((prev) => prev.filter((k) => k.key !== key));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
    }
  };

  return (
    <Container size="3" px="3" py="5">
      <Heading size="6" mb="1">
        ChatGPT connector
      </Heading>
      <Text as="p" size="2" color="gray" mb="5">
        Generate a personal key so a ChatGPT agent can read your Strava data
        (read-only) and build training plans from it.
      </Text>

      {error && (
        <Callout.Root color="red" mb="4">
          <Callout.Icon>
            <FiAlertTriangle />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      <Card mb="4">
        <Flex direction="column" gap="3" p="2">
          <Flex justify="between" align="center" gap="3" wrap="wrap">
            <Box>
              <Heading size="3">Your connector URL</Heading>
              <Text size="2" color="gray">
                Paste this into ChatGPT when creating the connector.
              </Text>
            </Box>
            <Button onClick={handleCreate} disabled={isCreating}>
              <FiPlus />
              {keys.length > 0 ? "Generate another" : "Generate key"}
            </Button>
          </Flex>

          <Separator size="4" />

          {isLoading ? (
            <Skeleton height="48px" />
          ) : keys.length === 0 ? (
            <Text size="2" color="gray">
              No key yet. Generate one to get your connector URL.
            </Text>
          ) : (
            <Flex direction="column" gap="3">
              {keys.map((k) => (
                <Box key={k.key}>
                  <Flex align="center" gap="2" wrap="wrap">
                    <Code
                      size="2"
                      variant="soft"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {k.connectorUrl}
                    </Code>
                    <CopyButton value={k.connectorUrl} />
                    <Tooltip content="Revoke">
                      <IconButton
                        variant="soft"
                        color="red"
                        onClick={() => handleRevoke(k.key)}
                        aria-label="Revoke key"
                      >
                        <FiTrash2 />
                      </IconButton>
                    </Tooltip>
                  </Flex>
                  <Text size="1" color="gray" mt="1" as="p">
                    Created {new Date(k.created_at).toLocaleString()}
                    {k.last_used_at
                      ? ` · last used ${new Date(
                          k.last_used_at,
                        ).toLocaleString()}`
                      : " · never used"}
                  </Text>
                </Box>
              ))}
            </Flex>
          )}

          <Callout.Root color="amber" size="1">
            <Callout.Icon>
              <FiAlertTriangle />
            </Callout.Icon>
            <Callout.Text>
              This URL contains a secret key that grants read access to your
              activities. Don't share it. Revoke it anytime to cut access.
            </Callout.Text>
          </Callout.Root>
        </Flex>
      </Card>

      <Card>
        <Flex direction="column" gap="2" p="2">
          <Heading size="3" mb="1">
            Add it in ChatGPT
          </Heading>
          <Text as="p" size="2">
            1. Go to <strong>Settings → Apps &amp; Connectors → Advanced
            settings</strong> and enable <strong>Developer mode</strong>.
          </Text>
          <Text as="p" size="2">
            2. Click <strong>Create</strong>, set the connector URL to the URL
            above, and choose <strong>No Authentication</strong>.
          </Text>
          <Text as="p" size="2">
            3. Enable the connector in a chat (Developer mode menu), then ask it
            to fetch your recent activities and draft a plan.
          </Text>
          <Text as="p" size="1" color="gray" mt="2">
            Available tools: list_activities, get_activity, get_activity_summary,
            get_athlete_zones, get_athlete_profile, search, fetch — all read-only.
          </Text>
        </Flex>
      </Card>
    </Container>
  );
}
