import { useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./layout/Sidebar";

function TopBar({ onMenuToggle }: { onMenuToggle: () => void }) {
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
    <header className="shrink-0 flex items-center border-b border-app bg-surface/60 px-4 sm:px-6 lg:px-10 py-3 backdrop-blur-sm">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuToggle}
        className="mr-3 flex md:hidden h-8 w-8 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-[var(--surface-hover)] hover:text-primary"
        aria-label="Toggle menu"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <path d="M2 4h12M2 8h12M2 12h12" />
        </svg>
      </button>

      {/* Mobile: prominent logo + name */}
      <div className="flex flex-1 items-center gap-3 md:hidden">
        <img
          src="/logo.jpg"
          alt="Eliza Fontaine"
          className="h-7 w-7 rounded-full object-cover object-top ring-1 ring-[#c9a96e]/50"
        />
        <span className="font-display italic text-[15px] font-semibold tracking-wide text-primary">
          Eliza Fontaine
        </span>
      </div>

      {/* Desktop: date + name on right */}
      <div className="hidden md:flex flex-1 items-center justify-end gap-4">
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
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-app text-primary transition-colors duration-200">
      {/* Backdrop overlay — mobile only */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar wrapper:
            - desktop (md+): always in normal flow
            - mobile open:   fixed full-height drawer (z-30)
            - mobile closed: hidden */}
      <div
        className={[
          "shrink-0 md:flex",
          mobileOpen
            ? "fixed inset-y-0 left-0 z-30 flex md:relative md:inset-auto md:z-auto"
            : "hidden",
        ].join(" ")}
      >
        <Sidebar
          onNavigate={() => setMobileOpen(false)}
          forceExpanded={mobileOpen}
        />
      </div>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar onMenuToggle={() => setMobileOpen((v) => !v)} />
        <main className="custom-scrollbar flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
