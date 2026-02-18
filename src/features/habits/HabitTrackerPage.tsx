import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { HabitDefinition, HabitLog } from "../../lib/api";

const TZ = "America/Monterrey";

function todayYMD(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export function HabitTrackerPage() {
  const [habits, setHabits] = useState<HabitDefinition[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newHabitName, setNewHabitName] = useState("");
  const [addingHabit, setAddingHabit] = useState(false);
  const [todayChecks, setTodayChecks] = useState<Record<string, boolean>>({});

  const today = todayYMD();

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.habitLog({ days: 30 });
      setHabits(res.habits);
      setLogs(res.logs);

      const todayLog = res.logs.find((l) => l.parsed?.date === today);
      if (todayLog?.parsed?.results) {
        setTodayChecks(todayLog.parsed.results);
      } else {
        const initial: Record<string, boolean> = {};
        for (const h of res.habits.filter((h) => h.active)) {
          initial[h.id] = false;
        }
        setTodayChecks(initial);
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

  async function saveToday() {
    setSaving(true);
    setError(null);
    try {
      await api.logHabits(today, todayChecks);
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function addHabit() {
    if (!newHabitName.trim()) return;
    setAddingHabit(true);
    try {
      await api.habitAction("add", { name: newHabitName.trim() });
      setNewHabitName("");
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to add habit");
    } finally {
      setAddingHabit(false);
    }
  }

  async function toggleHabitActive(id: string) {
    try {
      await api.habitAction("toggle", { id });
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to toggle habit");
    }
  }

  async function deleteHabit(id: string) {
    try {
      await api.habitAction("delete", { id });
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to delete habit");
    }
  }

  const activeHabits = habits.filter((h) => h.active);
  const todayLog = logs.find((l) => l.parsed?.date === today);
  const todayDone = activeHabits.filter((h) => todayChecks[h.id]).length;

  return (
    <div className="animate-page">
      <div className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Habit Tracker</h1>
          <p className="mt-1 text-sm text-muted">
            Daily habits — checked every night at 10 PM via Telegram.
          </p>
        </div>
        {!loading && activeHabits.length > 0 && (
          <span className="rounded-full bg-[var(--surface-raised)] border border-app px-3 py-1 text-xs font-medium text-secondary">
            {todayDone}/{activeHabits.length} today
          </span>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* Left column */}
        <div className="space-y-4">
          {/* Today's check-in */}
          <div className="rounded-2xl border border-app bg-surface p-5 shadow-sm transition-colors">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-primary">Today — {today}</h2>
              {todayLog && (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  Logged ✓
                </span>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-4">
                <span className="spinner" />
              </div>
            ) : activeHabits.length === 0 ? (
              <p className="text-sm text-muted">No active habits. Add one below.</p>
            ) : (
              <ul className="space-y-2.5">
                {activeHabits.map((h) => (
                  <li key={h.id} className="flex items-center gap-3">
                    <button
                      onClick={() =>
                        setTodayChecks((prev) => ({ ...prev, [h.id]: !prev[h.id] }))
                      }
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all ${
                        todayChecks[h.id]
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-app hover:border-emerald-400"
                      }`}
                    >
                      {todayChecks[h.id] && (
                        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </button>
                    <span className={`text-[13px] transition-colors ${
                      todayChecks[h.id] ? "line-through text-faint" : "text-primary"
                    }`}>
                      {h.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {!loading && activeHabits.length > 0 && (
              <button
                onClick={saveToday}
                disabled={saving}
                className="mt-5 w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-fg)] shadow-sm transition-all hover:bg-[var(--accent-hover)] active:scale-[0.97] disabled:opacity-40"
              >
                {saving ? "Saving…" : "Log Today's Habits"}
              </button>
            )}

            {error && (
              <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
            )}
          </div>

          {/* Add habit */}
          <div className="rounded-2xl border border-app bg-surface p-5 shadow-sm transition-colors">
            <h2 className="mb-3 text-sm font-semibold text-primary">Add Habit</h2>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-lg border border-app bg-[var(--surface-raised)] px-3 py-2 text-[13px] text-primary outline-none placeholder:text-faint focus:border-[var(--accent)]/50 transition-colors"
                placeholder="e.g. Read 30 minutes"
                value={newHabitName}
                onChange={(e) => setNewHabitName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addHabit()}
              />
              <button
                onClick={addHabit}
                disabled={addingHabit || !newHabitName.trim()}
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--accent-fg)] transition-all hover:bg-[var(--accent-hover)] disabled:opacity-40"
              >
                {addingHabit ? "…" : "Add"}
              </button>
            </div>
          </div>

          {/* All habits */}
          <div className="rounded-2xl border border-app bg-surface p-5 shadow-sm transition-colors">
            <h2 className="mb-3 text-sm font-semibold text-primary">All Habits</h2>
            {habits.length === 0 ? (
              <p className="text-sm text-faint">No habits yet.</p>
            ) : (
              <ul className="space-y-2">
                {habits.map((h) => (
                  <li key={h.id} className="group flex items-center gap-2">
                    <span className={`flex-1 text-[12px] ${h.active ? "text-primary" : "text-faint line-through"}`}>
                      {h.sort_order}. {h.name}
                    </span>
                    <button
                      onClick={() => toggleHabitActive(h.id)}
                      className="rounded px-1.5 py-0.5 text-[10px] text-muted opacity-0 transition hover:bg-[var(--surface-raised)] group-hover:opacity-100"
                    >
                      {h.active ? "disable" : "enable"}
                    </button>
                    <button
                      onClick={() => deleteHabit(h.id)}
                      className="rounded p-1 text-faint opacity-0 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M3 3l8 8M11 3l-8 8" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right column — history */}
        <div className="rounded-2xl border border-app bg-surface shadow-sm transition-colors">
          <div className="border-b border-subtle px-5 py-4">
            <h2 className="text-sm font-semibold text-primary">Recent Logs</h2>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <span className="spinner" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-faint">
              <div className="mb-2 text-3xl">~</div>
              <div className="text-sm">No habit logs yet</div>
            </div>
          ) : (
            <ul>
              {logs.map((log, i) => {
                const results = log.parsed?.results ?? {};
                const doneCount = activeHabits.filter((h) => results[h.id]).length;
                const total = activeHabits.length;
                const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
                return (
                  <li
                    key={log.id}
                    className={`animate-item px-5 py-4 ${i > 0 ? "border-t border-subtle" : ""}`}
                    style={{ animationDelay: `${i * 15}ms` }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-primary">{log.parsed?.date}</span>
                      <span className={`text-[12px] font-semibold ${
                        pct === 100 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-red-400"
                      }`}>
                        {doneCount}/{total} ({pct}%)
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {activeHabits.map((h) => (
                        <span
                          key={h.id}
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                            results[h.id]
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-[var(--surface-raised)] text-faint line-through"
                          }`}
                        >
                          {h.name}
                        </span>
                      ))}
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
