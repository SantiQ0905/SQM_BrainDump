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

const itemBase =
  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150";

export function Sidebar() {
  const { theme, toggle } = useTheme();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[#1e1e23] bg-[#0d0d10]">
      {/* Header */}
      <div className="px-5 pt-8 pb-5">
        <div className="font-display text-[18px] font-semibold leading-tight tracking-wide text-white">
          Eliza Fontaine
        </div>
        <div className="mt-1 text-[9px] font-semibold tracking-[0.18em] text-neutral-600 uppercase">
          Personal Assistant
        </div>
        <div className="mt-4 h-px bg-gradient-to-r from-[#c9a96e]/35 via-[#c9a96e]/10 to-transparent" />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                itemBase,
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
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-[#1e1e23] p-3 space-y-0.5">
        <button
          onClick={toggle}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[12px] font-medium text-neutral-600 transition-colors hover:bg-white/[0.05] hover:text-neutral-400"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-[11px] text-neutral-600">
            {theme === "dark" ? "☀" : "◑"}
          </span>
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>

        <button
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[12px] font-medium text-neutral-600 transition-colors hover:bg-white/[0.05] hover:text-neutral-400"
          onClick={() => {
            clearAdminKey();
            location.reload();
          }}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-[11px] text-neutral-600">
            ↪
          </span>
          Sign out
        </button>
      </div>
    </aside>
  );
}
