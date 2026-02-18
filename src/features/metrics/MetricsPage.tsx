import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Metrics } from "../../lib/api";

const MOOD_LABELS: Record<number, string> = {
  1: "Terrible", 2: "Bad", 3: "OK", 4: "Good", 5: "Great",
};

function StatCard({
  label,
  value,
  sub,
  color = "text-neutral-900",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-[12px] text-neutral-400">{sub}</div>}
    </div>
  );
}

export function MetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.metrics();
      setMetrics(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="text-sm text-neutral-300">Loading metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
    );
  }

  if (!metrics) return null;

  const habitStreakColor =
    metrics.habitStreak >= 14 ? "text-emerald-600"
    : metrics.habitStreak >= 7 ? "text-amber-500"
    : "text-neutral-900";

  const moodStreakColor =
    metrics.moodStreak >= 14 ? "text-emerald-600"
    : metrics.moodStreak >= 7 ? "text-amber-500"
    : "text-neutral-900";

  const taskRateColor =
    (metrics.taskCompletionRate ?? 0) >= 75 ? "text-emerald-600"
    : (metrics.taskCompletionRate ?? 0) >= 50 ? "text-amber-500"
    : "text-red-500";

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Metrics</h1>
        <p className="mt-1 text-sm text-neutral-400">Streaks, completion rates, and trends.</p>
      </div>

      {/* Stat cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Habit Streak"
          value={`${metrics.habitStreak}d`}
          sub="consecutive days logged"
          color={habitStreakColor}
        />
        <StatCard
          label="Mood Streak"
          value={`${metrics.moodStreak}d`}
          sub="consecutive days logged"
          color={moodStreakColor}
        />
        <StatCard
          label="Mood (7-day avg)"
          value={metrics.moodWeeklyAvg !== null ? `${metrics.moodWeeklyAvg}/5` : "–"}
          sub={metrics.moodWeeklyAvg !== null ? MOOD_LABELS[Math.round(metrics.moodWeeklyAvg)] : "No data yet"}
        />
        <StatCard
          label="Task Rate (30d)"
          value={metrics.taskCompletionRate !== null ? `${metrics.taskCompletionRate}%` : "–"}
          sub={`${metrics.tasksCompleted30d}/${metrics.tasksTotal30d} tasks done`}
          color={taskRateColor}
        />
      </div>

      {/* Today's habit progress */}
      {metrics.todayHabitsTotal > 0 && (
        <div className="mb-8 rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">Today's Habit Progress</h2>
          <div className="flex items-center gap-4">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all"
                style={{ width: `${(metrics.todayHabitsDone / metrics.todayHabitsTotal) * 100}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-neutral-600">
              {metrics.todayHabitsDone}/{metrics.todayHabitsTotal}
            </span>
          </div>
        </div>
      )}

      {/* Last 14 days table */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white shadow-sm">
        <div className="border-b border-neutral-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-neutral-700">Last 14 Days</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-100">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Date</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Habits</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Mood</th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Tasks Done</th>
              </tr>
            </thead>
            <tbody>
              {metrics.last14.map((day, i) => {
                const habitPct =
                  day.habitsTotal > 0 ? Math.round((day.habitsDone / day.habitsTotal) * 100) : null;
                const isToday = day.date === metrics.today;
                return (
                  <tr
                    key={day.date}
                    className={`${i > 0 ? "border-t border-neutral-100" : ""} ${isToday ? "bg-neutral-50" : ""}`}
                  >
                    <td className="px-5 py-3 text-[13px] font-medium text-neutral-700">
                      {day.date}
                      {isToday && (
                        <span className="ml-2 rounded-md bg-neutral-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-neutral-500">
                          today
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {habitPct !== null ? (
                        <span
                          className={`text-[12px] font-semibold ${
                            habitPct === 100 ? "text-emerald-500"
                            : habitPct >= 50 ? "text-amber-500"
                            : "text-red-400"
                          }`}
                        >
                          {day.habitsDone}/{day.habitsTotal}
                        </span>
                      ) : (
                        <span className="text-[12px] text-neutral-300">–</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {day.mood !== null ? (
                        <span className="text-[12px] font-semibold text-neutral-700">
                          {day.mood}/5
                        </span>
                      ) : (
                        <span className="text-[12px] text-neutral-300">–</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[12px] font-semibold ${day.tasksDone > 0 ? "text-neutral-700" : "text-neutral-300"}`}>
                        {day.tasksDone > 0 ? day.tasksDone : "–"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
