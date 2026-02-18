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
        // Initialize all active habits as unchecked
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
    <div>
      <div className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Habit Tracker</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Daily habits — checked every night at 10 PM via Telegram.
          </p>
        </div>
        {!loading && activeHabits.length > 0 && (
          <span className="rounded-full bg-neutral-200/60 px-3 py-1 text-xs font-medium text-neutral-500">
            {todayDone}/{activeHabits.length} today
          </span>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* Left column */}
        <div className="space-y-4">
          {/* Today's check-in */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-700">Today — {today}</h2>
              {todayLog && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-600">
                  Logged ✓
                </span>
              )}
            </div>

            {loading ? (
              <div className="text-sm text-neutral-300">Loading...</div>
            ) : activeHabits.length === 0 ? (
              <p className="text-sm text-neutral-400">No active habits. Add one below.</p>
            ) : (
              <ul className="space-y-2">
                {activeHabits.map((h) => (
                  <li key={h.id} className="flex items-center gap-3">
                    <button
                      onClick={() =>
                        setTodayChecks((prev) => ({ ...prev, [h.id]: !prev[h.id] }))
                      }
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        todayChecks[h.id]
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-neutral-300 hover:border-neutral-400"
                      }`}
                    >
                      {todayChecks[h.id] && (
                        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </button>
                    <span className={`text-[13px] ${todayChecks[h.id] ? "line-through text-neutral-400" : "text-neutral-800"}`}>
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
                className="mt-4 w-full rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-neutral-800 active:scale-[0.97] disabled:opacity-40"
              >
                {saving ? "Saving..." : "Log Today's Habits"}
              </button>
            )}

            {error && (
              <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
            )}
          </div>

          {/* Add habit */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-neutral-700">Add Habit</h2>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-800 outline-none placeholder:text-neutral-300 focus:border-neutral-400"
                placeholder="e.g. Read 30 minutes"
                value={newHabitName}
                onChange={(e) => setNewHabitName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addHabit()}
              />
              <button
                onClick={addHabit}
                disabled={addingHabit || !newHabitName.trim()}
                className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                {addingHabit ? "..." : "Add"}
              </button>
            </div>
          </div>

          {/* All habits list (config) */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-neutral-700">All Habits</h2>
            {habits.length === 0 ? (
              <p className="text-sm text-neutral-300">No habits yet.</p>
            ) : (
              <ul className="space-y-2">
                {habits.map((h) => (
                  <li key={h.id} className="group flex items-center gap-2">
                    <span className={`flex-1 text-[12px] ${h.active ? "text-neutral-700" : "text-neutral-400 line-through"}`}>
                      {h.sort_order}. {h.name}
                    </span>
                    <button
                      onClick={() => toggleHabitActive(h.id)}
                      className="rounded px-1.5 py-0.5 text-[10px] text-neutral-400 opacity-0 transition hover:bg-neutral-100 group-hover:opacity-100"
                    >
                      {h.active ? "disable" : "enable"}
                    </button>
                    <button
                      onClick={() => deleteHabit(h.id)}
                      className="rounded p-1 text-neutral-300 opacity-0 transition hover:bg-red-50 hover:text-red-400 group-hover:opacity-100"
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

        {/* Right column — recent history */}
        <div className="rounded-2xl border border-neutral-200/80 bg-white shadow-sm">
          <div className="border-b border-neutral-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-neutral-700">Recent Logs</h2>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="text-sm text-neutral-300">Loading...</div>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-300">
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
                  <li key={log.id} className={`px-5 py-4 ${i > 0 ? "border-t border-neutral-100" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-neutral-700">{log.parsed?.date}</span>
                      <span className={`text-[12px] font-semibold ${pct === 100 ? "text-emerald-500" : pct >= 50 ? "text-amber-500" : "text-red-400"}`}>
                        {doneCount}/{total} ({pct}%)
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {activeHabits.map((h) => (
                        <span
                          key={h.id}
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                            results[h.id]
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-neutral-100 text-neutral-400 line-through"
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
