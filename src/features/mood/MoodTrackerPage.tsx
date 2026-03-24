import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { MoodLog } from "../../lib/api";

const TZ = "America/Monterrey";

function todayYMD(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

const MOOD_LABELS: Record<number, string> = {
  1: "Terrible",
  2: "Bad",
  3: "OK",
  4: "Good",
  5: "Great",
};

const MOOD_COLORS: Record<number, { pill: string; ring: string }> = {
  1: { pill: "bg-red-500/15 text-red-400 border-red-500/30",    ring: "ring-red-500/40 bg-red-500/10" },
  2: { pill: "bg-orange-500/15 text-orange-400 border-orange-500/30", ring: "ring-orange-500/40 bg-orange-500/10" },
  3: { pill: "bg-amber-500/15 text-amber-400 border-amber-500/30",  ring: "ring-amber-500/40 bg-amber-500/10" },
  4: { pill: "bg-lime-500/15 text-lime-400 border-lime-500/30",    ring: "ring-lime-500/40 bg-lime-500/10" },
  5: { pill: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", ring: "ring-emerald-500/40 bg-emerald-500/10" },
};

export function MoodTrackerPage() {
  const [logs, setLogs] = useState<MoodLog[]>([]);
  const [todayLog, setTodayLog] = useState<MoodLog | null>(null);
  const [weeklyAvg, setWeeklyAvg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const today = todayYMD();

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.mood({ days: 30 });
      setLogs(res.logs);
      setTodayLog(res.todayLog);
      setWeeklyAvg(res.weeklyAvg);
      if (res.todayLog) {
        setSelectedScore(res.todayLog.parsed?.score ?? null);
        setNotes(res.todayLog.parsed?.notes ?? "");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveMood() {
    if (!selectedScore) return;
    setSaving(true);
    setError(null);
    try {
      await api.logMood(today, selectedScore, notes || undefined);
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-page">
      <div className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Mood Tracker</h1>
          <p className="mt-1 text-sm text-muted">
            Daily quality of day (1=worst, 5=best). Prompted at 10 PM.
          </p>
        </div>
        {weeklyAvg !== null && (
          <span className="rounded-full bg-[var(--surface-raised)] border border-app px-3 py-1 text-xs font-medium text-secondary">
            7-day avg: {weeklyAvg}/5
          </span>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* Left column */}
        <div className="space-y-4">
          {/* Today's entry */}
          <div className="rounded-2xl border border-app bg-surface p-5 shadow-sm transition-colors">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-primary">Today — {today}</h2>
              {todayLog && (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  Logged ✓
                </span>
              )}
            </div>

            <div className="mb-4 grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((score) => {
                const c = MOOD_COLORS[score];
                return (
                  <button
                    key={score}
                    onClick={() => setSelectedScore(score)}
                    className={`flex flex-col items-center rounded-xl border-2 px-1 py-3 transition-all ${
                      selectedScore === score
                        ? `ring-2 ring-offset-1 ring-offset-[var(--surface)] ${c.ring} border-transparent`
                        : "border-app hover:border-[var(--border)]"
                    }`}
                  >
                    <span className="text-lg font-bold text-primary">{score}</span>
                    <span className="mt-0.5 text-center text-[9px] font-medium leading-tight text-muted">
                      {MOOD_LABELS[score]}
                    </span>
                  </button>
                );
              })}
            </div>

            <textarea
              className="w-full resize-none rounded-lg border border-app bg-[var(--surface-raised)] px-3 py-2 text-[13px] text-primary placeholder:text-faint outline-none focus:border-[var(--accent)]/40 transition-colors"
              rows={2}
              placeholder="Optional note about today…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <button
              onClick={saveMood}
              disabled={saving || !selectedScore}
              className="mt-3 w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-fg)] shadow-sm transition-all hover:bg-[var(--accent-hover)] active:scale-[0.97] disabled:opacity-40"
            >
              {saving ? "Saving…" : todayLog ? "Update Mood" : "Log Mood"}
            </button>

            {error && (
              <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
            )}
          </div>

          {/* Weekly summary */}
          {!loading && logs.length > 0 && (
            <div className="rounded-2xl border border-app bg-surface p-5 shadow-sm transition-colors">
              <h2 className="mb-3 text-sm font-semibold text-primary">Last 7 Days</h2>
              <div className="space-y-2">
                {logs.slice(0, 7).map((log) => {
                  const score = log.parsed?.score ?? 0;
                  const c = MOOD_COLORS[score] ?? { pill: "bg-[var(--surface-raised)] text-secondary border-app" };
                  return (
                    <div key={log.id} className="flex items-center gap-2 min-w-0">
                      <span className="w-24 shrink-0 text-[11px] text-muted">{log.parsed?.date}</span>
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${c.pill}`}>
                        {score}/5 {MOOD_LABELS[score]}
                      </span>
                      {log.parsed?.notes && (
                        <span className="truncate min-w-0 text-[11px] text-muted" title={log.parsed.notes}>
                          {log.parsed.notes}
                        </span>
                      )}
                    </div>
                  );
                })}
                {weeklyAvg !== null && (
                  <div className="mt-3 border-t border-subtle pt-3">
                    <span className="text-[12px] font-semibold text-secondary">
                      Average: {weeklyAvg}/5
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right column — full history */}
        <div className="rounded-2xl border border-app bg-surface shadow-sm transition-colors">
          <div className="border-b border-subtle px-5 py-4">
            <h2 className="text-sm font-semibold text-primary">Mood History</h2>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <span className="spinner" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-faint">
              <div className="mb-2 text-3xl">~</div>
              <div className="text-sm">No mood logs yet</div>
            </div>
          ) : (
            <ul>
              {logs.map((log, i) => {
                const score = log.parsed?.score ?? 0;
                const c = MOOD_COLORS[score] ?? { pill: "bg-[var(--surface-raised)] text-secondary border-app" };
                return (
                  <li
                    key={log.id}
                    className={`animate-item flex items-start gap-4 px-5 py-3.5 ${i > 0 ? "border-t border-subtle" : ""}`}
                    style={{ animationDelay: `${i * 15}ms` }}
                  >
                    <span className={`mt-0.5 shrink-0 rounded-md border px-2 py-0.5 text-[12px] font-bold ${c.pill}`}>
                      {score}/5
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-primary">{log.parsed?.date}</span>
                        <span className="text-[11px] text-muted">{MOOD_LABELS[score]}</span>
                      </div>
                      {log.parsed?.notes && (
                        <p className="mt-0.5 text-[12px] text-secondary">{log.parsed.notes}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-sm">
                      {"⭐".repeat(score)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
