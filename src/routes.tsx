import { createBrowserRouter } from "react-router";
import { Home } from "./pages/Home";
import { Dashboard } from "./pages/Dashboard";
import { Callback } from "./pages/Callback";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/dashboard",
    element: <Dashboard />,
  },
  {
    path: "/callback",
    element: <Callback />,
  },
]);

