import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { clearAdminKey } from "../../lib/adminKey";

const itemBase =
  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150";
const activeClass = "bg-white/15 text-white";
const inactiveClass = "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.07]";

const NAV_ITEMS: { to: string; label: string; icon: string }[] = [
  { to: "/inbox", label: "Inbox", icon: "I" },
  { to: "/tasks", label: "Tasks", icon: "T" },
  { to: "/notes", label: "Notes", icon: "N" },
  { to: "/bookmarks", label: "Bookmarks", icon: "B" },
  { to: "/journal", label: "Journal", icon: "J" },
];

export function Sidebar() {
  return (
    <aside className="flex w-60 flex-col bg-neutral-900">
      <div className="px-5 pt-7 pb-6">
        <div className="text-[15px] font-bold tracking-tight text-white">
          brain-dump
        </div>
        <div className="mt-1 text-[11px] font-medium tracking-wide text-neutral-500">
          CAPTURE EVERYTHING
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(itemBase, isActive ? activeClass : inactiveClass)
            }
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-[11px] font-semibold">
              {icon}
            </span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <button
          className="w-full rounded-lg px-3 py-2 text-[12px] font-medium text-neutral-500 transition-colors hover:bg-white/[0.07] hover:text-neutral-300"
          onClick={() => {
            clearAdminKey();
            location.reload();
          }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
