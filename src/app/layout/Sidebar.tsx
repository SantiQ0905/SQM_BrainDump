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
  { to: "/budget",    label: "Budget",    icon: "$" },
];

/** Small tooltip that appears to the right when sidebar is collapsed */
function CollapseTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-lg border border-[#2a2a33] bg-[#1a1a20] px-3 py-1.5 text-[12px] font-medium text-neutral-200 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
      {label}
    </span>
  );
}

export function Sidebar({
  onNavigate,
  forceExpanded = false,
}: {
  onNavigate?: () => void;
  forceExpanded?: boolean;
}) {
  const { theme, toggle } = useTheme();

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("ef.sidebar") === "true"
  );

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("ef.sidebar", next ? "true" : "false");
  }

  // On mobile (forceExpanded), always show expanded view
  const isExpanded = forceExpanded || !collapsed;

  return (
    <aside
      className={clsx(
        "flex h-full shrink-0 flex-col border-r border-[#1e1e23] bg-[#0d0d10]",
        "transition-[width] duration-300 ease-in-out",
        isExpanded ? "w-60 max-w-[80vw]" : "w-[68px]"
      )}
    >
      {/* ── Header ────────────────────────────────────────── */}
      <div className="overflow-hidden">
        {!isExpanded ? (
          /* Collapsed: bold logo with strong glow */
          <div className="flex justify-center py-4">
            <img
              src="/logo.jpg"
              alt="Eliza Fontaine"
              className="h-14 w-14 rounded-full object-cover object-top ring-2 ring-[#c9a96e]/60 ring-offset-[3px] ring-offset-[#0d0d10]"
              style={{ boxShadow: "0 0 0 1px rgba(201,169,110,0.12), 0 0 24px rgba(201,169,110,0.35)" }}
            />
          </div>
        ) : (
          /* Expanded: cinematic hero banner */
          <>
            <div className="relative">
              {/* Portrait — tall for strong presence */}
              <img
                src="/logo.jpg"
                alt="Eliza Fontaine"
                className="h-72 w-full object-cover object-top"
              />

              {/* Bottom-to-top fade */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d10] via-[#0d0d10]/50 to-transparent" />

              {/* Side vignettes for depth */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#0d0d10]/30 via-transparent to-[#0d0d10]/30" />

              {/* Text overlay */}
              <div className="absolute bottom-0 left-0 right-0 px-5 pb-5">
                <p
                  className="font-display text-[26px] font-semibold leading-tight tracking-wide text-white"
                  style={{ textShadow: "0 2px 32px rgba(0,0,0,0.98)" }}
                >
                  Eliza Fontaine
                </p>
                <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.34em] text-[#c9a96e]"
                  style={{ textShadow: "0 0 12px rgba(201,169,110,0.5)" }}
                >
                  Personal Assistant
                </p>
              </div>
            </div>

            {/* Gold separator — brighter */}
            <div className="h-px bg-gradient-to-r from-transparent via-[#c9a96e]/70 to-transparent" />
          </>
        )}
      </div>

      {/* ── Nav ───────────────────────────────────────────── */}
      <nav className={clsx("flex-1 space-y-0.5 py-2", !isExpanded ? "px-2" : "px-3")}>
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            title={!isExpanded ? label : undefined}
            className={({ isActive }) =>
              clsx(
                "group relative flex items-center rounded-lg transition-all duration-150",
                !isExpanded ? "justify-center py-2.5" : "gap-3 px-3 py-2.5",
                isActive
                  ? "bg-[#c9a96e]/15 text-[#c9a96e]"
                  : "text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-200"
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={clsx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] font-bold transition-colors",
                    isActive
                      ? "bg-[#c9a96e]/25 text-[#c9a96e]"
                      : "bg-white/[0.06] text-neutral-500"
                  )}
                >
                  {icon}
                </span>

                {isExpanded && (
                  <span className="text-[13.5px] font-semibold">{label}</span>
                )}

                {!isExpanded && <CollapseTooltip label={label} />}
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
          title={!isExpanded ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}
          className={clsx(
            "group relative flex w-full items-center rounded-lg text-[12px] font-medium text-neutral-600 transition-colors hover:bg-white/[0.05] hover:text-neutral-400",
            !isExpanded ? "justify-center py-2" : "gap-3 px-3 py-2"
          )}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-[11px] text-neutral-600">
            {theme === "dark" ? "☀" : "◑"}
          </span>
          {isExpanded && (theme === "dark" ? "Light mode" : "Dark mode")}
          {!isExpanded && <CollapseTooltip label={theme === "dark" ? "Light mode" : "Dark mode"} />}
        </button>

        {/* Sign out */}
        <button
          onClick={() => { clearAdminKey(); location.reload(); }}
          title={!isExpanded ? "Sign out" : undefined}
          className={clsx(
            "group relative flex w-full items-center rounded-lg text-[12px] font-medium text-neutral-600 transition-colors hover:bg-white/[0.05] hover:text-neutral-400",
            !isExpanded ? "justify-center py-2" : "gap-3 px-3 py-2"
          )}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-[11px] text-neutral-600">
            ↪
          </span>
          {isExpanded && "Sign out"}
          {!isExpanded && <CollapseTooltip label="Sign out" />}
        </button>

        {/* Collapse toggle — hidden when forced expanded (mobile drawer) */}
        {!forceExpanded && (
          <button
            onClick={toggleCollapsed}
            title={!isExpanded ? "Expand sidebar" : "Collapse sidebar"}
            className={clsx(
              "group relative flex w-full items-center rounded-lg text-[12px] font-medium text-neutral-700 transition-colors hover:bg-white/[0.05] hover:text-neutral-500",
              !isExpanded ? "justify-center py-2" : "gap-3 px-3 py-2"
            )}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-[11px]">
              {!isExpanded ? "›" : "‹"}
            </span>
            {isExpanded && "Collapse"}
            {!isExpanded && <CollapseTooltip label="Expand sidebar" />}
          </button>
        )}
      </div>
    </aside>
  );
}
