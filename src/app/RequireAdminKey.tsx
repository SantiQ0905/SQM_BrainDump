import { useMemo, useState } from "react";
import { getAdminKey, setAdminKey } from "../lib/adminKey";

export function RequireAdminKey({ children }: { children: React.ReactNode }) {
  const existing = useMemo(() => getAdminKey(), []);
  const [key, setKey] = useState(existing ?? "");
  const [saved, setSaved] = useState(!!existing);

  if (!saved) {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-900">
        <div className="mx-auto flex min-h-screen max-w-lg items-center p-6">
          <div className="w-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="text-xl font-semibold">Enter Admin Key</div>
            <p className="mt-2 text-sm text-neutral-600">
              No accounts. This key protects your private API.
            </p>

            <input
              className="mt-4 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200"
              placeholder="Paste ADMIN_KEY…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              type="password"
            />

            <button
              className="mt-4 w-full rounded-xl bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              disabled={key.trim().length < 10}
              onClick={() => {
                setAdminKey(key.trim());
                setSaved(true);
              }}
            >
              Save
            </button>

            <div className="mt-3 text-xs text-neutral-500">
              Stored in your browser localStorage. You can clear it in the sidebar.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
