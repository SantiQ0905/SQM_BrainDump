import { useMemo, useState } from "react";
import { getAdminKey, setAdminKey } from "../lib/adminKey";

export function RequireAdminKey({ children }: { children: React.ReactNode }) {
  const existing = useMemo(() => getAdminKey(), []);
  const [key, setKey] = useState(existing ?? "");
  const [saved, setSaved] = useState(!!existing);

  if (!saved) {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-900">
        <div className="mx-auto flex min-h-screen max-w-sm items-center px-6">
          <div className="w-full">
            <div className="mb-8">
              <div className="text-base font-bold tracking-tight">brain-dump</div>
              <div className="mt-0.5 text-[11px] text-neutral-400">
                capture everything, sort later
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="text-sm font-medium text-neutral-800">Admin Key</div>
              <p className="mt-1 text-[12px] text-neutral-400">
                No accounts. Just paste your key.
              </p>

              <input
                className="mt-4 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition-colors focus:border-neutral-400"
                placeholder="Paste ADMIN_KEY..."
                value={key}
                onChange={(e) => setKey(e.target.value)}
                type="password"
              />

              <button
                className="mt-3 w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-40"
                disabled={key.trim().length < 10}
                onClick={() => {
                  setAdminKey(key.trim());
                  setSaved(true);
                }}
              >
                Continue
              </button>

              <div className="mt-3 text-[11px] text-neutral-300">
                Stored in localStorage. Clear anytime from the sidebar.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
