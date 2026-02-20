import { useEffect, useMemo, useState } from "react";
import { getAdminKey, setAdminKey } from "../lib/adminKey";

export function RequireAdminKey({ children }: { children: React.ReactNode }) {
  const existing = useMemo(() => getAdminKey(), []);
  const [key, setKey] = useState(existing ?? "");
  const [saved, setSaved] = useState(!!existing);

  // Always render login in dark — apply dark class on mount, restore after
  useEffect(() => {
    if (!saved) {
      document.documentElement.classList.add("dark");
    }
  }, [saved]);

  if (!saved) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d0d10]">
        {/* Ambient glow — dual layer */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c9a96e]/[0.07] blur-[140px]" />
          <div className="absolute left-1/2 bottom-0 h-64 w-96 -translate-x-1/2 rounded-full bg-[#c9a96e]/[0.04] blur-[80px]" />
        </div>

        <div className="animate-page relative w-full max-w-sm px-6">
          {/* Portrait */}
          <div className="mb-7 flex justify-center">
              <img
                src="/logo.jpg"
                alt="Logo"
                className="rounded-full w-32 h-32 ring-8 ring-cyan-400 ring-offset-8 shadow-2xl border-4 border-white"
                style={{ boxShadow: '0 0 64px 16px #38bdf8, 0 0 128px 32px #fff', filter: 'brightness(1.2) contrast(1.2)' }}
              />
          </div>

          {/* Wordmark */}
          <div className="mb-8 text-center">
            <div className="font-display text-[34px] font-semibold tracking-wide text-white">
              Eliza Fontaine
            </div>
            <div className="mt-2 text-[9px] font-bold tracking-[0.30em] text-[#c9a96e] uppercase">
              Personal Assistant
            </div>
            <div className="mx-auto mt-5 h-px w-24 bg-gradient-to-r from-transparent via-[#c9a96e]/70 to-transparent" />
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-[#2a2a33] bg-[#161619] p-6 shadow-2xl shadow-black/50">
            <div className="text-sm font-semibold text-neutral-200">Access Key</div>
            <p className="mt-1 text-[12px] text-[#5c5b6d]">
              No accounts — just paste your key.
            </p>

            <input
              className="mt-5 w-full rounded-lg border border-[#2a2a33] bg-[#0d0d10] px-3.5 py-2.5 text-sm text-white placeholder:text-[#3d3c4d] outline-none transition-colors focus:border-[#c9a96e]/40 focus:ring-1 focus:ring-[#c9a96e]/20"
              placeholder="Paste ADMIN_KEY..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && key.trim().length >= 10) {
                  setAdminKey(key.trim());
                  setSaved(true);
                }
              }}
              type="password"
              autoFocus
            />

            <button
              className="mt-4 w-full rounded-lg bg-[#c9a96e] px-3 py-2.5 text-sm font-semibold text-[#0d0d10] transition-all hover:bg-[#dbbe84] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={key.trim().length < 10}
              onClick={() => {
                setAdminKey(key.trim());
                setSaved(true);
              }}
            >
              Continue
            </button>

            <div className="mt-4 text-center text-[11px] text-[#3d3c4d]">
              Stored in localStorage · clear anytime from the sidebar
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
