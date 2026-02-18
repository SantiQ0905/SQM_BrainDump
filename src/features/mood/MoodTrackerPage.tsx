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

const MOOD_COLORS: Record<number, string> = {
  1: "bg-red-100 text-red-600 border-red-200",
  2: "bg-orange-100 text-orange-600 border-orange-200",
  3: "bg-amber-100 text-amber-600 border-amber-200",
  4: "bg-lime-100 text-lime-600 border-lime-200",
  5: "bg-green-100 text-green-600 border-green-200",
};

const MOOD_RING: Record<number, string> = {
  1: "ring-red-400 bg-red-50",
  2: "ring-orange-400 bg-orange-50",
  3: "ring-amber-400 bg-amber-50",
  4: "ring-lime-400 bg-lime-50",
  5: "ring-green-400 bg-green-50",
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
    <div>
      <div className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Mood Tracker</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Daily quality of day (1=worst, 5=best). Prompted at 10 PM.
          </p>
        </div>
        {weeklyAvg !== null && (
          <span className="rounded-full bg-neutral-200/60 px-3 py-1 text-xs font-medium text-neutral-500">
            7-day avg: {weeklyAvg}/5
          </span>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* Left column */}
        <div className="space-y-4">
          {/* Today's entry */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-700">Today — {today}</h2>
              {todayLog && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-600">
                  Logged ✓
                </span>
              )}
            </div>

            <div className="mb-4 grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  key={score}
                  onClick={() => setSelectedScore(score)}
                  className={`flex flex-col items-center rounded-xl border-2 px-1 py-3 transition-all ${
                    selectedScore === score
                      ? `ring-2 ring-offset-1 ${MOOD_RING[score]} border-transparent`
                      : "border-neutral-200 hover:border-neutral-300"
                  }`}
                >
                  <span className="text-lg font-bold text-neutral-700">{score}</span>
                  <span className="mt-0.5 text-[9px] font-medium text-neutral-400 leading-tight text-center">
                    {MOOD_LABELS[score]}
                  </span>
                </button>
              ))}
            </div>

            <textarea
              className="w-full resize-none rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] text-neutral-800 placeholder:text-neutral-300 outline-none focus:border-neutral-400"
              rows={2}
              placeholder="Optional note about today…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <button
              onClick={saveMood}
              disabled={saving || !selectedScore}
              className="mt-3 w-full rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-neutral-800 active:scale-[0.97] disabled:opacity-40"
            >
              {saving ? "Saving..." : todayLog ? "Update Mood" : "Log Mood"}
            </button>

            {error && (
              <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
            )}
          </div>

          {/* Weekly summary */}
          {!loading && logs.length > 0 && (
            <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-neutral-700">Last 7 Days</h2>
              <div className="space-y-2">
                {logs.slice(0, 7).map((log) => {
                  const score = log.parsed?.score ?? 0;
                  const cls = MOOD_COLORS[score] ?? "bg-neutral-100 text-neutral-500 border-neutral-200";
                  return (
                    <div key={log.id} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-[11px] text-neutral-400">{log.parsed?.date}</span>
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
                        {score}/5 {MOOD_LABELS[score]}
                      </span>
                      {log.parsed?.notes && (
                        <span className="truncate text-[11px] text-neutral-400" title={log.parsed.notes}>
                          {log.parsed.notes}
                        </span>
                      )}
                    </div>
                  );
                })}
                {weeklyAvg !== null && (
                  <div className="mt-3 border-t border-neutral-100 pt-3">
                    <span className="text-[12px] font-semibold text-neutral-600">
                      Average: {weeklyAvg}/5
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right column — full history */}
        <div className="rounded-2xl border border-neutral-200/80 bg-white shadow-sm">
          <div className="border-b border-neutral-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-neutral-700">Mood History</h2>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="text-sm text-neutral-300">Loading...</div>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-300">
              <div className="mb-2 text-3xl">~</div>
              <div className="text-sm">No mood logs yet</div>
            </div>
          ) : (
            <ul>
              {logs.map((log, i) => {
                const score = log.parsed?.score ?? 0;
                const cls = MOOD_COLORS[score] ?? "bg-neutral-100 text-neutral-500 border-neutral-200";
                return (
                  <li key={log.id} className={`flex items-start gap-4 px-5 py-3.5 ${i > 0 ? "border-t border-neutral-100" : ""}`}>
                    <span className={`mt-0.5 shrink-0 rounded-md border px-2 py-0.5 text-[12px] font-bold ${cls}`}>
                      {score}/5
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-neutral-600">{log.parsed?.date}</span>
                        <span className="text-[11px] text-neutral-400">{MOOD_LABELS[score]}</span>
                      </div>
                      {log.parsed?.notes && (
                        <p className="mt-0.5 text-[12px] text-neutral-500">{log.parsed.notes}</p>
                      )}
                    </div>
                    <div className="shrink-0">
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
