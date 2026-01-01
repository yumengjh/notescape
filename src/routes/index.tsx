import { lazy, type ReactNode } from "react";

const MainPage = lazy(() => import("../component/Main/main"));
const AboutPage = lazy(() => import("../pages/About"));
const ToolPage = lazy(() => import("../pages/Tool"));
const HistoryPage = lazy(() => import("../pages/History"));

export type AppRoute = {
  key: string;
  label: string;
  path: string;
  element: ReactNode;
  inSidebar?: boolean;
};

export const appRoutes: AppRoute[] = [
  {
    key: "home",
    label: "首页",
    path: "/",
    element: <MainPage />,
    inSidebar: true,
  },
  {
    key: "about",
    label: "关于",
    path: "/about",
    element: <AboutPage />,
    inSidebar: true,
  },
  {
    key: "tool",
    label: "工具",
    path: "/tool",
    element: <ToolPage />,
    inSidebar: true,
  },
  {
    key: "history",
    label: "历史版本",
    path: "/history",
    element: <HistoryPage />,
    inSidebar: false,
  },
];

export const sidebarItems = appRoutes
  .filter((route) => route.inSidebar)
  .map(({ key, label, path }) => ({ key, label, path }));
