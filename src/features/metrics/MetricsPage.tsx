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
  accent = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-app bg-surface p-5 shadow-sm transition-colors">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${accent ? "text-accent" : "text-primary"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[12px] text-muted">{sub}</div>}
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
      <div className="animate-page flex justify-center py-20">
        <span className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-page rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
    );
  }

  if (!metrics) return null;

  const habitStreakAccent = metrics.habitStreak >= 7;
  const moodStreakAccent  = metrics.moodStreak >= 7;
  const taskRateAccent    = (metrics.taskCompletionRate ?? 0) >= 75;

  return (
    <div className="animate-page">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-primary">Metrics</h1>
        <p className="mt-1 text-sm text-muted">Streaks, completion rates, and trends.</p>
      </div>

      {/* Stat cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Habit Streak"
          value={`${metrics.habitStreak}d`}
          sub="consecutive days logged"
          accent={habitStreakAccent}
        />
        <StatCard
          label="Mood Streak"
          value={`${metrics.moodStreak}d`}
          sub="consecutive days logged"
          accent={moodStreakAccent}
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
          accent={taskRateAccent}
        />
      </div>

      {/* Today's habit progress */}
      {metrics.todayHabitsTotal > 0 && (
        <div className="mb-8 rounded-2xl border border-app bg-surface p-5 shadow-sm transition-colors">
          <h2 className="mb-3 text-sm font-semibold text-primary">Today's Habit Progress</h2>
          <div className="flex items-center gap-4">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-raised)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                style={{ width: `${(metrics.todayHabitsDone / metrics.todayHabitsTotal) * 100}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-primary">
              {metrics.todayHabitsDone}/{metrics.todayHabitsTotal}
            </span>
          </div>
        </div>
      )}

      {/* Last 14 days table */}
      <div className="rounded-2xl border border-app bg-surface shadow-sm transition-colors">
        <div className="border-b border-subtle px-5 py-4">
          <h2 className="text-sm font-semibold text-primary">Last 14 Days</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-subtle">
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted">Date</th>
                <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-widest text-muted">Habits</th>
                <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-widest text-muted">Mood</th>
                <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-widest text-muted">Tasks Done</th>
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
                    className={`animate-item ${i > 0 ? "border-t border-subtle" : ""} ${
                      isToday ? "bg-[var(--surface-raised)]" : "hover-surface"
                    } transition-colors`}
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <td className="px-5 py-3 text-[13px] font-medium text-primary">
                      {day.date}
                      {isToday && (
                        <span className="ml-2 rounded-md bg-[var(--accent-subtle)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent">
                          today
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {habitPct !== null ? (
                        <span className={`text-[12px] font-semibold ${
                          habitPct === 100 ? "text-emerald-400"
                          : habitPct >= 50 ? "text-amber-400"
                          : "text-red-400"
                        }`}>
                          {day.habitsDone}/{day.habitsTotal}
                        </span>
                      ) : (
                        <span className="text-[12px] text-faint">–</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {day.mood !== null ? (
                        <span className="text-[12px] font-semibold text-primary">
                          {day.mood}/5
                        </span>
                      ) : (
                        <span className="text-[12px] text-faint">–</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[12px] font-semibold ${
                        day.tasksDone > 0 ? "text-primary" : "text-faint"
                      }`}>
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
