import { createClient } from "@supabase/supabase-js";

const TZ = "America/Monterrey";

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function json(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function ymdInTZ(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

function addDays(date: Date, days: number) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/** Count consecutive logged days going backwards from today (or yesterday if today missing). */
function computeStreak(logDates: string[], today: string): number {
  if (!logDates.length) return 0;
  const dateSet = new Set(logDates);

  // Start from today; if today not logged, check if yesterday was
  let cursor = today;
  if (!dateSet.has(cursor)) {
    // Not logged today yet — count from yesterday
    cursor = ymdInTZ(addDays(new Date(), -1), TZ);
    if (!dateSet.has(cursor)) return 0;
  }

  let streak = 0;
  let d = new Date(cursor + "T12:00:00Z");
  while (true) {
    const ymd = ymdInTZ(d, TZ);
    if (!dateSet.has(ymd)) break;
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}


export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("allow", "GET");
      return res.end();
    }

    const adminKey = req.headers["x-admin-key"];
    if (!adminKey || adminKey !== getEnv("ADMIN_KEY")) {
      return json(res, 401, { error: "Unauthorized" });
    }

    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false },
    });

    const today = ymdInTZ(new Date(), TZ);

    // Fetch habit definitions (active ones)
    const [habitsResult, habitLogsResult, moodLogsResult, taskLogsResult] = await Promise.all([
      supabase.from("habit_definitions").select("id, name").eq("active", true),
      supabase
        .from("lines")
        .select("parsed")
        .eq("bucket", "habits")
        .order("created_at", { ascending: false })
        .limit(90),
      supabase
        .from("lines")
        .select("parsed")
        .eq("bucket", "mood")
        .order("created_at", { ascending: false })
        .limit(90),
      supabase
        .from("lines")
        .select("parsed, created_at")
        .eq("bucket", "tasks")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const activeHabits = habitsResult.data ?? [];
    const habitLogs = habitLogsResult.data ?? [];
    const moodLogs = moodLogsResult.data ?? [];
    const taskRows = taskLogsResult.data ?? [];

    // ── Habit streak ──────────────────────────────────────────────
    const habitLogDates = habitLogs
      .map((r: any) => r.parsed?.date as string)
      .filter(Boolean);
    const habitStreak = computeStreak(habitLogDates, today);

    // Today's habit completion (if logged)
    const todayHabitLog = habitLogs.find((r: any) => r.parsed?.date === today);
    const todayResults = todayHabitLog?.parsed?.results ?? {};
    const todayHabitsDone = activeHabits.filter((h: any) => todayResults[h.id] === true).length;
    const todayHabitsTotal = activeHabits.length;

    // ── Mood streak + weekly avg ──────────────────────────────────
    const moodLogDates = moodLogs
      .map((r: any) => r.parsed?.date as string)
      .filter(Boolean);
    const moodStreak = computeStreak(moodLogDates, today);

    const last7Scores = moodLogs
      .slice(0, 7)
      .map((r: any) => r.parsed?.score)
      .filter((s: any) => typeof s === "number");
    const moodWeeklyAvg = last7Scores.length
      ? Math.round((last7Scores.reduce((a: number, b: number) => a + b, 0) / last7Scores.length) * 10) / 10
      : null;

    // ── Task completion rate (last 30 days) ───────────────────────
    const thirtyDaysAgo = ymdInTZ(addDays(new Date(), -30), TZ);
    const recentTasks = taskRows.filter((t: any) => {
      const d = t.created_at?.slice(0, 10) ?? "";
      return d >= thirtyDaysAgo;
    });
    const doneTasks = recentTasks.filter((t: any) => t?.parsed?.done === true).length;
    const totalTasks = recentTasks.length;
    const taskCompletionRate = totalTasks > 0
      ? Math.round((doneTasks / totalTasks) * 100)
      : null;

    // ── Last 14 days grid ─────────────────────────────────────────
    const last14: Array<{ date: string; habitsDone: number; habitsTotal: number; mood: number | null; tasksDone: number }> = [];
    for (let i = 0; i < 14; i++) {
      const d = ymdInTZ(addDays(new Date(), -i), TZ);
      const hLog = habitLogs.find((r: any) => r.parsed?.date === d);
      const mLog = moodLogs.find((r: any) => r.parsed?.date === d);
      const dayResults = hLog?.parsed?.results ?? {};
      const dayHabitsDone = activeHabits.filter((h: any) => dayResults[h.id] === true).length;
      const dayTasksDone = taskRows.filter((t: any) =>
        t.created_at?.slice(0, 10) === d && t.parsed?.done === true
      ).length;
      last14.push({
        date: d,
        habitsDone: dayHabitsDone,
        habitsTotal: activeHabits.length,
        mood: mLog?.parsed?.score ?? null,
        tasksDone: dayTasksDone,
      });
    }

    return json(res, 200, {
      today,
      habitStreak,
      moodStreak,
      moodWeeklyAvg,
      todayHabitsDone,
      todayHabitsTotal,
      taskCompletionRate,
      tasksCompleted30d: doneTasks,
      tasksTotal30d: totalTasks,
      last14,
    });
  } catch (e: any) {
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
