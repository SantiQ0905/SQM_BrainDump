import { createClient } from "@supabase/supabase-js";

// Handles two cron jobs via ?type= query param:
//   GET /api/cron/extras?type=overdue   → overdue task nudge (1 PM)
//   GET /api/cron/extras?type=checkin   → evening habit + mood check-in (10 PM)

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

function getDayOfWeek(tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short",
  }).formatToParts(new Date());
  const day = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[day] ?? 0;
}

async function tgSend(chatId: string, text: string) {
  const token = getEnv("TELEGRAM_BOT_TOKEN");
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  }).catch(() => {});
}

async function getChatIds(supabase: any): Promise<string[]> {
  const { data } = await supabase
    .from("lines")
    .select("parsed")
    .eq("source", "telegram")
    .order("created_at", { ascending: false })
    .limit(500);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const r of data ?? []) {
    const cid = r?.parsed?.telegram_chat_id;
    if (cid && !seen.has(String(cid))) { seen.add(String(cid)); ids.push(String(cid)); }
  }
  return ids;
}

// ── Overdue nudge ──────────────────────────────────────────────────────────
// slot=1 → ~1 PM (window 11–15)  — midday check
// slot=2 → ~5 PM (window 16–19)  — end-of-day push
async function handleOverdue(req: any, res: any, supabase: any) {
  const localHour = getLocalHour(TZ);
  const slot = (req.query?.slot as string) === "2" ? "2" : "1";

  const window = slot === "2" ? { min: 16, max: 19 } : { min: 11, max: 15 };
  if (localHour < window.min || localHour > window.max) {
    return json(res, 200, { ok: true, skipped: true, reason: `hour=${localHour}, outside slot-${slot} window` });
  }

  const today = ymdInTZ(new Date(), TZ);
  const nudgeType = `overdue_nudge_${today}_slot${slot}`;
  const chatIds = await getChatIds(supabase);
  if (!chatIds.length) return json(res, 200, { ok: true, msg: "No chats" });

  const { data: alreadySent } = await supabase
    .from("notifications_sent").select("id").eq("type", nudgeType).limit(1);
  if (alreadySent?.length) return json(res, 200, { ok: true, skipped: true, reason: `Already nudged today (slot ${slot})` });

  const { data: tasks, error } = await supabase
    .from("lines").select("id, raw, parsed").eq("bucket", "tasks")
    .order("created_at", { ascending: false }).limit(2000);
  if (error) return json(res, 500, { error: error.message });

  const overdue = (tasks ?? [])
    .filter((t: any) => t?.parsed?.done !== true && typeof t?.parsed?.due === "string" && t.parsed.due < today)
    .sort((a: any, b: any) => String(a.parsed?.due ?? "").localeCompare(String(b.parsed?.due ?? "")));

  if (!overdue.length) return json(res, 200, { ok: true, msg: "No overdue tasks" });

  const header = slot === "2"
    ? `End-of-day — ${overdue.length} task${overdue.length > 1 ? "s" : ""} still overdue:`
    : `Overdue nudge — ${overdue.length} task${overdue.length > 1 ? "s" : ""} overdue:`;

  const lines = [header];
  for (const t of overdue.slice(0, 10)) {
    lines.push(`- ${t.raw.slice(0, 60)} ^${t.parsed?.due ?? "?"}${t.parsed?.priority ? ` !${t.parsed.priority}` : ""}`);
  }
  if (overdue.length > 10) lines.push(`…and ${overdue.length - 10} more.`);
  lines.push(slot === "2" ? "\nLast chance today — mark done or reschedule." : "\nReview and reschedule or mark done.");
  const msg = lines.join("\n");

  for (const cid of chatIds) {
    await tgSend(cid, msg);
    await supabase.from("notifications_sent").insert({
      line_id: overdue[0].id,
      type: nudgeType,
      chat_id: cid,
    });
  }
  return json(res, 200, { ok: true, slot, overdue: overdue.length, sent_to: chatIds });
}

// ── Evening check-in (habits + mood) ──────────────────────────────────────
async function handleCheckin(req: any, res: any, supabase: any) {
  const localHour = getLocalHour(TZ);
  if (localHour < 21 || localHour > 23) {
    return json(res, 200, { ok: true, skipped: true, reason: `hour=${localHour}, not check-in time` });
  }

  const today = ymdInTZ(new Date(), TZ);
  const chatIds = await getChatIds(supabase);
  if (!chatIds.length) return json(res, 200, { ok: true, msg: "No chats" });

  const messages: string[] = [];

  // Habits
  const { data: habits } = await supabase
    .from("habit_definitions").select("id, name, sort_order")
    .eq("active", true).order("sort_order", { ascending: true });
  const activeHabits = habits ?? [];

  if (activeHabits.length > 0) {
    const { data: existingLogs } = await supabase
      .from("lines").select("id, parsed").eq("bucket", "habits")
      .order("created_at", { ascending: false }).limit(10);
    const alreadyLogged = (existingLogs ?? []).some((r: any) => r.parsed?.date === today);

    if (!alreadyLogged) {
      messages.push([
        `Habit Check-in (${today}):`,
        activeHabits.map((h: any, i: number) => `${i + 1}. ${h.name}`).join("\n"),
        "",
        "Reply with: HT: 1-YES, 2-NO, 3-YES...",
        "(or: HT: 1 3 5  to mark those as YES, rest as NO)",
      ].join("\n"));
    } else {
      messages.push("Habits already logged for today ✓");
    }
  }

  // Mood
  const { data: existingMood } = await supabase
    .from("lines").select("parsed").eq("bucket", "mood")
    .order("created_at", { ascending: false }).limit(10);
  const moodAlreadyLogged = (existingMood ?? []).some((r: any) => r.parsed?.date === today);

  if (!moodAlreadyLogged) {
    messages.push(`Mood Check-in: How was today? (1=worst, 5=best)\nReply: MD: 4`);
  } else {
    const score = (existingMood ?? []).find((r: any) => r.parsed?.date === today)?.parsed?.score;
    messages.push(`Mood already logged for today: ${score}/5 ✓`);
  }

  // Weekly mood review on Sundays
  if (getDayOfWeek(TZ) === 0) {
    const last7 = (existingMood ?? []).slice(0, 7);
    if (last7.length > 0) {
      const scores = last7.map((r: any) => r.parsed?.score).filter(Boolean) as number[];
      const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "–";
      messages.push([
        "Weekly Mood Review:",
        last7.map((r: any) => `${r.parsed?.date ?? "?"}: ${"⭐".repeat(r.parsed?.score ?? 0)} (${r.parsed?.score ?? "?"})`).join("\n"),
        `Avg: ${avg} | Min: ${scores.length ? Math.min(...scores) : "–"} | Max: ${scores.length ? Math.max(...scores) : "–"}`,
      ].join("\n"));
    }
  }

  for (const cid of chatIds) {
    for (const msg of messages) await tgSend(cid, msg);
  }
  return json(res, 200, { ok: true, today, messages_sent: messages.length, sent_to: chatIds });
}

// ── Main handler ───────────────────────────────────────────────────────────
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

    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false },
    });

    const type = (req.query?.type as string) ?? "";

    if (type === "overdue") return await handleOverdue(req, res, supabase);
    if (type === "checkin") return await handleCheckin(req, res, supabase);

    return json(res, 400, { error: "Missing ?type=overdue|checkin" });
  } catch (e: any) {
    console.error(e);
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
