import { RouterProvider } from "react-router";
import { router } from "./routes";
import { useSessionCapture } from "./hooks/useSessionCapture";

// Wrapper component to handle PWA session capture
function SessionHandler({ children }: { children: React.ReactNode }) {
  // Capture session from URL hash on mount (for PWA OAuth flow)
  useSessionCapture();
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
