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

function getLocalHour(tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", hour12: false,
  }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

function addDays(date: Date, days: number) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function getDayOfWeek(tz: string): number {
  // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short",
  }).formatToParts(new Date());
  const day = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[day] ?? 0;
}

async function tgSendMessage(chatId: string, text: string) {
  const token = getEnv("TELEGRAM_BOT_TOKEN");
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    console.error("Telegram sendMessage failed:", r.status, t);
  }
}

// 10 PM Monterrey = 04 UTC next day  → schedule: 0 4 * * *
// DST guard: only runs if local hour is 21–23

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("allow", "GET");
      return res.end();
    }

    const secret = req.headers["x-cron-secret"] ?? req.headers["cron_secret"];
    if (!secret || secret !== getEnv("CRON_SECRET")) {
      return json(res, 401, { error: "Unauthorized cron" });
    }

    // DST guard: only run if local hour is 21, 22, or 23
    const localHour = getLocalHour(TZ);
    if (localHour < 21 || localHour > 23) {
      return json(res, 200, { ok: true, skipped: true, reason: `hour=${localHour}, not evening check-in time` });
    }

    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false },
    });

    const today = ymdInTZ(new Date(), TZ);

    // Discover chat IDs
    const { data: chatRows } = await supabase
      .from("lines")
      .select("parsed")
      .eq("source", "telegram")
      .order("created_at", { ascending: false })
      .limit(500);

    const chatIds: string[] = [];
    const seen = new Set<string>();
    for (const r of chatRows ?? []) {
      const cid = r?.parsed?.telegram_chat_id;
      if (cid && !seen.has(String(cid))) {
        seen.add(String(cid));
        chatIds.push(String(cid));
      }
    }

    if (!chatIds.length) {
      return json(res, 200, { ok: true, msg: "No chats discovered" });
    }

    const messages: string[] = [];

    // ── Habit check-in ────────────────────────────────────────────────
    const { data: habits } = await supabase
      .from("habit_definitions")
      .select("id, name, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true });

    const activeHabits = habits ?? [];

    if (activeHabits.length > 0) {
      // Check if already logged today
      const { data: existingLogs } = await supabase
        .from("lines")
        .select("id, parsed")
        .eq("bucket", "habits")
        .order("created_at", { ascending: false })
        .limit(10);

      const alreadyLogged = (existingLogs ?? []).some((r: any) => r.parsed?.date === today);

      if (!alreadyLogged) {
        const habitLines = activeHabits.map((h: any, i: number) => `${i + 1}. ${h.name}`);
        const habitMsg = [
          `Habit Check-in (${today}):`,
          habitLines.join("\n"),
          "",
          "Reply with: HT: 1-YES, 2-NO, 3-YES...",
          "(or: HT: 1 3 5  to mark those as YES, rest as NO)",
        ].join("\n");
        messages.push(habitMsg);
      } else {
        messages.push(`Habits already logged for today ✓`);
      }
    }

    // ── Mood check-in ─────────────────────────────────────────────────
    const { data: existingMood } = await supabase
      .from("lines")
      .select("parsed")
      .eq("bucket", "mood")
      .order("created_at", { ascending: false })
      .limit(10);

    const moodAlreadyLogged = (existingMood ?? []).some((r: any) => r.parsed?.date === today);

    if (!moodAlreadyLogged) {
      messages.push(`Mood Check-in: How was today? (1=worst, 5=best)\nReply: MD: 4`);
    } else {
      const todayScore = (existingMood ?? []).find((r: any) => r.parsed?.date === today)?.parsed?.score;
      messages.push(`Mood already logged for today: ${todayScore}/5 ✓`);
    }

    // ── Weekly mood review (Sundays only) ─────────────────────────────
    const dayOfWeek = getDayOfWeek(TZ);
    if (dayOfWeek === 0) {
      // Sunday — build weekly mood summary
      const last7 = (existingMood ?? []).slice(0, 7);
      if (last7.length > 0) {
        const scores = last7.map((r: any) => r.parsed?.score).filter(Boolean);
        const avg = scores.length
          ? (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(1)
          : "–";
        const min = scores.length ? Math.min(...scores) : "–";
        const max = scores.length ? Math.max(...scores) : "–";
        const entries = last7.map((r: any) =>
          `${r.parsed?.date ?? "?"}: ${"⭐".repeat(r.parsed?.score ?? 0)} (${r.parsed?.score ?? "?"})`
        ).join("\n");
        messages.push([
          "Weekly Mood Review:",
          entries,
          `Avg: ${avg} | Min: ${min} | Max: ${max}`,
        ].join("\n"));
      }
    }

    // Send all messages sequentially
    for (const cid of chatIds) {
      for (const msg of messages) {
        await tgSendMessage(cid, msg);
      }
    }

    return json(res, 200, {
      ok: true,
      today,
      messages_sent: messages.length,
      sent_to: chatIds,
    });
  } catch (e: any) {
    console.error(e);
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
