import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import { ApiError } from "./lib/api";
import App from "./App.tsx";
import "./index.css";

const TWENTY_FOUR_HOURS = 1000 * 60 * 60 * 24;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: TWENTY_FOUR_HOURS,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status === 401) return false;
        return failureCount < 1;
      },
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: TWENTY_FOUR_HOURS,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => query.state.status === "success",
        },
      }}
    >
      <Theme accentColor="orange" grayColor="sand" radius="medium" scaling="100%">
        <App />
      </Theme>
    </PersistQueryClientProvider>
  </StrictMode>
);
