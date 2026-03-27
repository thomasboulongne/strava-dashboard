import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { useSessionCapture } from "./hooks/useSessionCapture";

function SessionHandler({ children }: { children: React.ReactNode }) {
  useSessionCapture();

  // Ask the browser to keep our storage persistent (prevents iOS from
  // evicting localStorage/IndexedDB for the installed PWA).
  useEffect(() => {
    navigator.storage?.persist?.();
  }, []);

  return <>{children}</>;
}

function App() {
  return (
    <SessionHandler>
      <RouterProvider router={router} />
    </SessionHandler>
  );
}

export default App;
