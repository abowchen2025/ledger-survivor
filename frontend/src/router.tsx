import { createHashRouter } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import AnalysisPage from "@/pages/AnalysisPage";
import CalendarPage from "@/pages/CalendarPage";
import InstallmentsPage from "@/pages/InstallmentsPage";
import MonthlyPage from "@/pages/MonthlyPage";
import SettingsPage from "@/pages/SettingsPage";
import ThisWeekPage from "@/pages/ThisWeekPage";

// 路由方式：HashRouter（網址形如 /ledger-survivor/#/calendar）。
// 理由：GitHub Pages 是純靜態主機，沒有 SPA fallback；BrowserRouter 在使用者直接開啟
// 或重新整理 /ledger-survivor/calendar 時會拿到 Pages 的 404，需要 404.html 轉址的變通做法。
// HashRouter 不需要任何伺服器設定，重新整理與加入主畫面後開啟都正常。
// 若要改用 BrowserRouter：把 createHashRouter 換成 createBrowserRouter 並加上
// { basename: import.meta.env.BASE_URL }，再處理 Pages 的 404 fallback（見 docs/adr/0004）。
export const ROUTES = [
  { path: "/", label: "本週" },
  { path: "/calendar", label: "月曆" },
  { path: "/installments", label: "分期" },
  { path: "/monthly", label: "月結" },
  { path: "/analysis", label: "分析" },
  { path: "/settings", label: "設定" },
] as const;

export const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <ThisWeekPage /> },
      { path: "/calendar", element: <CalendarPage /> },
      { path: "/installments", element: <InstallmentsPage /> },
      { path: "/monthly", element: <MonthlyPage /> },
      { path: "/analysis", element: <AnalysisPage /> },
      { path: "/settings", element: <SettingsPage /> },
    ],
  },
]);
