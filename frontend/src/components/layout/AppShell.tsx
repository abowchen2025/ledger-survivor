import { NavLink, Outlet } from "react-router-dom";

import { cn } from "@/lib/utils";
import { ROUTES } from "@/router";

/** 骨架版外框：上方標題、中間頁面內容、下方六頁導覽。Phase 0 不放任何業務畫面。 */
export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b px-4 py-3">
        <h1 className="text-base font-semibold">Ledger Survivor</h1>
      </header>
      <main className="flex-1 px-4 py-6">
        <Outlet />
      </main>
      <nav className="sticky bottom-0 grid grid-cols-6 border-t bg-background text-xs">
        {ROUTES.map((r) => (
          <NavLink
            key={r.path}
            to={r.path}
            end={r.path === "/"}
            className={({ isActive }) =>
              cn("py-3 text-center", isActive ? "font-semibold text-primary" : "text-muted-foreground")
            }
          >
            {r.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
