import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { clearAdminKey } from "../../lib/adminKey";

const itemBase =
  "block rounded-lg px-3 py-2 text-sm transition-colors";
const active = "bg-neutral-900 text-white font-medium";
const inactive = "text-neutral-700 hover:bg-neutral-100";

const NAV_ITEMS = [
  { to: "/inbox", label: "Inbox" },
  { to: "/tasks", label: "Tasks" },
  { to: "/notes", label: "Notes" },
  { to: "/bookmarks", label: "Bookmarks" },
  { to: "/journal", label: "Journal" },
];

export function Sidebar() {
  return (
    <aside className="flex w-56 flex-col border-r border-neutral-200 bg-white">
      <div className="p-5 pb-4">
        <div className="text-base font-bold tracking-tight">brain-dump</div>
        <div className="mt-0.5 text-[11px] text-neutral-400">
          capture everything, sort later
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(itemBase, isActive ? active : inactive)
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-neutral-100 p-3">
        <button
          className="w-full rounded-lg px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-neutral-600"
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
