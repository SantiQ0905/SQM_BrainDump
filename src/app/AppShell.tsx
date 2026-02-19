import { useMemo } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./layout/Sidebar";

function TopBar() {
  const date = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    []
  );

  return (
    <header className="shrink-0 flex items-center justify-end border-b border-app bg-surface/60 px-10 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <span className="font-display italic text-[13px] font-medium tracking-wide text-muted">
          Eliza Fontaine
        </span>
        <span className="h-3 w-px bg-[var(--border)]" />
        <span className="text-[11px] text-faint">{date}</span>
      </div>
    </header>
  );
}

export function AppShell() {
  return (
    // overflow-hidden lives on the content wrapper, NOT the root —
    // this lets sidebar tooltips extend beyond the sidebar edge
    <div className="flex h-screen bg-app text-primary transition-colors duration-200">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="custom-scrollbar flex-1 overflow-y-auto">
          <div className="p-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
