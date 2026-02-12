import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { clearAdminKey } from "../../lib/adminKey";

const itemBase =
  "block rounded-lg px-3 py-2 text-sm transition hover:bg-neutral-100";
const active = "bg-neutral-100 font-medium";

export function Sidebar() {
  return (
    <aside className="w-64 border-r border-neutral-200 bg-white p-4">
      <div className="mb-4">
        <div className="text-lg font-semibold">Brain Dump</div>
        <div className="text-xs text-neutral-500">Telegram → Inbox → Process</div>
      </div>

      <nav className="space-y-1">
        <NavLink
          to="/inbox"
          className={({ isActive }) => clsx(itemBase, isActive && active)}
        >
          Inbox
        </NavLink>

        {/* placeholders for later */}
        <div className="mt-3 text-xs uppercase tracking-wide text-neutral-400">
          Coming soon
        </div>
        <div className="space-y-1 opacity-60">
          <div className={clsx(itemBase, "cursor-not-allowed")}>Tasks</div>
          <div className={clsx(itemBase, "cursor-not-allowed")}>Notes</div>
          <div className={clsx(itemBase, "cursor-not-allowed")}>Bookmarks</div>
          <div className={clsx(itemBase, "cursor-not-allowed")}>Journal</div>
        </div>
      </nav>

      <div className="mt-6 border-t border-neutral-200 pt-4">
        <button
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
          onClick={() => {
            clearAdminKey();
            location.reload();
          }}
        >
          Clear Admin Key
        </button>
        <div className="mt-2 text-xs text-neutral-500">
          (Only needed because we’re skipping accounts.)
        </div>
      </div>
    </aside>
  );
}
