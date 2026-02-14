import { useMemo, useState } from "react";
import { getAdminKey, setAdminKey } from "../lib/adminKey";

export function RequireAdminKey({ children }: { children: React.ReactNode }) {
  const existing = useMemo(() => getAdminKey(), []);
  const [key, setKey] = useState(existing ?? "");
  const [saved, setSaved] = useState(!!existing);

  if (!saved) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-900 text-white">
        <div className="w-full max-w-sm px-6">
          <div className="mb-10 text-center">
            <div className="text-xl font-bold tracking-tight">brain-dump</div>
            <div className="mt-1 text-[12px] font-medium tracking-widest text-neutral-500">
              CAPTURE EVERYTHING
            </div>
          </div>

          <div className="rounded-2xl bg-neutral-800 p-6">
            <div className="text-sm font-semibold text-neutral-200">Admin Key</div>
            <p className="mt-1 text-[12px] text-neutral-500">
              No accounts. Just paste your key.
            </p>

            <input
              className="mt-5 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3.5 py-2.5 text-sm text-white placeholder:text-neutral-600 outline-none transition-colors focus:border-neutral-500"
              placeholder="Paste ADMIN_KEY..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              type="password"
            />

            <button
              className="mt-4 w-full rounded-lg bg-white px-3 py-2.5 text-sm font-semibold text-neutral-900 transition-all hover:bg-neutral-100 active:scale-[0.98] disabled:opacity-30"
              disabled={key.trim().length < 10}
              onClick={() => {
                setAdminKey(key.trim());
                setSaved(true);
              }}
            >
              Continue
            </button>

            <div className="mt-4 text-center text-[11px] text-neutral-600">
              Stored in localStorage. Clear anytime from the sidebar.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
