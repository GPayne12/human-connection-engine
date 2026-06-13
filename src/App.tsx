import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./components/Layout";
import { TodayView } from "./components/today/TodayView";
import { PeopleList } from "./components/people/PeopleList";
import { PersonPage } from "./components/people/PersonPage";
import { CampaignBoard } from "./components/campaigns/CampaignBoard";
import { AppProvider } from "./context/AppContext";
import { useAppData } from "./hooks/useAppData";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <TodayView /> },
      { path: "people", element: <PeopleList /> },
      { path: "people/:id", element: <PersonPage /> },
      { path: "campaigns", element: <CampaignBoard /> },
    ],
  },
]);

function AppWithData() {
  const data = useAppData();
  return (
    <AppProvider value={data}>
      <RouterProvider router={router} />
    </AppProvider>
  );
}

export default function App() {
  return <AppWithData />;
}
