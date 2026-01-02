import { createBrowserRouter } from "react-router";
import { Home } from "./pages/Home";
import { Dashboard } from "./pages/Dashboard";
import { Callback } from "./pages/Callback";
import { TrainingPlan } from "./pages/TrainingPlan";

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
  {
    path: "/plan",
    element: <TrainingPlan />,
  },
]);

