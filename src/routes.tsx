import { createBrowserRouter } from "react-router";
import { Home } from "./pages/Home";
import { Dashboard } from "./pages/Dashboard";
import { Callback } from "./pages/Callback";
import { TrainingPlan } from "./pages/TrainingPlan";
import { Layout } from "./components/Layout";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/callback",
    element: <Callback />,
  },
  {
    // Protected routes with shared layout
    element: <Layout />,
    children: [
      {
        path: "/dashboard",
        element: <Dashboard />,
      },
      {
        path: "/plan",
        element: <TrainingPlan />,
      },
    ],
  },
]);
