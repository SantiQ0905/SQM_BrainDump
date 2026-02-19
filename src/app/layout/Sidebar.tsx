import { useState } from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { clearAdminKey } from "../../lib/adminKey";
import { useTheme } from "../ThemeContext";

const NAV_ITEMS: { to: string; label: string; icon: string }[] = [
  { to: "/inbox",     label: "Inbox",     icon: "I" },
  { to: "/tasks",     label: "Tasks",     icon: "T" },
  { to: "/notes",     label: "Notes",     icon: "N" },
  { to: "/bookmarks", label: "Bookmarks", icon: "B" },
  { to: "/journal",   label: "Journal",   icon: "J" },
  { to: "/habits",    label: "Habits",    icon: "H" },
  { to: "/mood",      label: "Mood",      icon: "M" },
  { to: "/metrics",   label: "Metrics",   icon: "~" },
];

/** Small tooltip that appears to the right when sidebar is collapsed */
function CollapseTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-lg border border-[#2a2a33] bg-[#1a1a20] px-3 py-1.5 text-[12px] font-medium text-neutral-200 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
      {label}
    </span>
  );
}

export function Sidebar() {
  const { theme, toggle } = useTheme();

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("ef.sidebar") === "true"
  );

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("ef.sidebar", next ? "true" : "false");
  }

  return (
    <aside
      className={clsx(
        "flex shrink-0 flex-col border-r border-[#1e1e23] bg-[#0d0d10]",
        "transition-[width] duration-300 ease-in-out",
        collapsed ? "w-[68px]" : "w-60"
      )}
    >
      {/* ── Header ────────────────────────────────────────── */}
      <div className="overflow-hidden">
        {collapsed ? (
          /* Collapsed: small logo centered */
          <div className="flex justify-center py-5">
            <img
              src="/logo.jpg"
              alt="Eliza Fontaine"
              className="h-10 w-10 rounded-full object-cover object-top ring-2 ring-[#c9a96e]/30 ring-offset-2 ring-offset-[#0d0d10]"
            />
          </div>
        ) : (
          /* Expanded: full-width hero banner */
          <>
            <div className="relative">
              {/* Portrait image — flush to all edges */}
              <img
                src="/logo.jpg"
                alt="Eliza Fontaine"
                className="h-56 w-full object-cover object-top"
              />

              {/* Gradient: transparent top → full sidebar-bg at bottom */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d10] via-[#0d0d10]/55 to-transparent" />

              {/* Side vignettes for depth */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#0d0d10]/30 via-transparent to-[#0d0d10]/30" />

              {/* Text overlay */}
              <div className="absolute bottom-0 left-0 right-0 px-5 pb-5">
                <p className="font-display text-[22px] font-semibold leading-tight tracking-wide text-white [text-shadow:0_2px_16px_rgba(0,0,0,0.9)]">
                  Eliza Fontaine
                </p>
                <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.3em] text-[#c9a96e]">
                  Personal Assistant
                </p>
              </div>
            </div>

            {/* Gold separator line */}
            <div className="h-px bg-gradient-to-r from-transparent via-[#c9a96e]/40 to-transparent" />
          </>
        )}
      </div>

      {/* ── Nav ───────────────────────────────────────────── */}
      <nav className={clsx("flex-1 space-y-0.5", collapsed ? "px-2" : "px-3")}>
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              clsx(
                "group relative flex items-center rounded-lg transition-all duration-150",
                collapsed ? "justify-center py-2.5" : "gap-3 px-3 py-2.5",
                isActive
                  ? "bg-[#c9a96e]/12 text-[#c9a96e]"
                  : "text-neutral-500 hover:bg-white/[0.05] hover:text-neutral-300"
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={clsx(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold transition-colors",
                    isActive
                      ? "bg-[#c9a96e]/20 text-[#c9a96e]"
                      : "bg-white/[0.05] text-neutral-600"
                  )}
                >
                  {icon}
                </span>

                {!collapsed && (
                  <span className="text-[13px] font-medium">{label}</span>
                )}

                {collapsed && <CollapseTooltip label={label} />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Footer ────────────────────────────────────────── */}
      <div className={clsx("border-t border-[#1e1e23] p-2 space-y-0.5")}>
        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={collapsed ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}
          className={clsx(
            "group relative flex w-full items-center rounded-lg text-[12px] font-medium text-neutral-600 transition-colors hover:bg-white/[0.05] hover:text-neutral-400",
            collapsed ? "justify-center py-2" : "gap-3 px-3 py-2"
          )}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-[11px] text-neutral-600">
            {theme === "dark" ? "☀" : "◑"}
          </span>
          {!collapsed && (theme === "dark" ? "Light mode" : "Dark mode")}
          {collapsed && <CollapseTooltip label={theme === "dark" ? "Light mode" : "Dark mode"} />}
        </button>

        {/* Sign out */}
        <button
          onClick={() => { clearAdminKey(); location.reload(); }}
          title={collapsed ? "Sign out" : undefined}
          className={clsx(
            "group relative flex w-full items-center rounded-lg text-[12px] font-medium text-neutral-600 transition-colors hover:bg-white/[0.05] hover:text-neutral-400",
            collapsed ? "justify-center py-2" : "gap-3 px-3 py-2"
          )}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-[11px] text-neutral-600">
            ↪
          </span>
          {!collapsed && "Sign out"}
          {collapsed && <CollapseTooltip label="Sign out" />}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={clsx(
            "group relative flex w-full items-center rounded-lg text-[12px] font-medium text-neutral-700 transition-colors hover:bg-white/[0.05] hover:text-neutral-500",
            collapsed ? "justify-center py-2" : "gap-3 px-3 py-2"
          )}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-[11px]">
            {collapsed ? "›" : "‹"}
          </span>
          {!collapsed && "Collapse"}
          {collapsed && <CollapseTooltip label="Expand sidebar" />}
        </button>
      </div>
    </aside>
  );
}
