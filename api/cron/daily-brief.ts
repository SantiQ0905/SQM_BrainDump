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
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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

function getLocalHour(tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

async function tgSendMessage(chatId: string | number, text: string) {
  const token = getEnv("TELEGRAM_BOT_TOKEN");
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    console.error("Telegram sendMessage failed:", r.status, t);
  }
}

function buildMorningBrief(
  today: string,
  inboxCount: number,
  openTasks: any[],
  dueToday: any[],
  overdue: any[]
): string {
  const top = openTasks
    .slice()
    .sort((a: any, b: any) => {
      const pa = a?.parsed?.priority ?? 99;
      const pb = b?.parsed?.priority ?? 99;
      if (pa !== pb) return pa - pb;
      const da = a?.parsed?.due ?? "9999-12-31";
      const db = b?.parsed?.due ?? "9999-12-31";
      return String(da).localeCompare(String(db));
    })
    .slice(0, 5);

  const out: string[] = [];
  out.push(`Morning brief (${today})`);
  out.push(`Inbox: ${inboxCount}`);
  out.push(`Due today: ${dueToday.length} • Overdue: ${overdue.length}`);

  if (top.length) {
    out.push("");
    out.push("Top tasks:");
    for (const t of top) {
      const due = t?.parsed?.due ? ` ^${t.parsed.due}` : "";
      const pr = t?.parsed?.priority ? ` !${t.parsed.priority}` : "";
      out.push(`- ${t.raw}${due}${pr}`);
    }
  }

  return out.join("\n");
}

function buildEveningBrief(
  today: string,
  tomorrow: string,
  allTasks: any[],
  openTasks: any[]
): string {
  const completedToday = allTasks.filter((t: any) => {
    return t?.parsed?.done === true && t.created_at?.startsWith(today);
  });

  const stillOpenToday = openTasks.filter((t: any) => t?.parsed?.due === today);
  const dueTomorrow = openTasks.filter((t: any) => t?.parsed?.due === tomorrow);

  const out: string[] = [];
  out.push(`Evening brief (${today})`);
  out.push(`Completed today: ${completedToday.length}`);
  out.push(`Still due today: ${stillOpenToday.length}`);
  out.push(`Due tomorrow: ${dueTomorrow.length}`);

  if (stillOpenToday.length) {
    out.push("");
    out.push("Still open today:");
    for (const t of stillOpenToday.slice(0, 5)) {
      const time = t?.parsed?.due_time ? ` @${t.parsed.due_time}` : "";
      out.push(`- ${t.raw}${time}`);
    }
  }

  if (dueTomorrow.length) {
    out.push("");
    out.push("Due tomorrow:");
    for (const t of dueTomorrow.slice(0, 5)) {
      const time = t?.parsed?.due_time ? ` @${t.parsed.due_time}` : "";
      out.push(`- ${t.raw}${time}`);
    }
  }

  return out.join("\n");
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("allow", "GET");
      return res.end();
    }

    // Protect the cron endpoint
    const secret = req.headers["x-cron-secret"];
    if (!secret || secret !== getEnv("CRON_SECRET")) {
      return json(res, 401, { error: "Unauthorized cron" });
    }

    const briefType = (req.query?.type as string) || "morning";

    // Guard against DST drift: only send if local hour is ~7 AM or ~7 PM
    const localHour = getLocalHour(TZ);
    if (briefType === "morning" && (localHour < 6 || localHour > 8)) {
      return json(res, 200, { ok: true, skipped: true, reason: `Local hour is ${localHour}, not morning` });
    }
    if (briefType === "evening" && (localHour < 18 || localHour > 20)) {
      return json(res, 200, { ok: true, skipped: true, reason: `Local hour is ${localHour}, not evening` });
    }

    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false },
    });

    const today = ymdInTZ(new Date(), TZ);
    const tomorrow = ymdInTZ(addDays(new Date(), 1), TZ);

    // Discover chat IDs
    const { data: chatRows, error: chatErr } = await supabase
      .from("lines")
      .select("parsed")
      .eq("source", "telegram")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (chatErr) return json(res, 500, { error: chatErr.message });

    const chatIds = new Set<string>();
    for (const r of chatRows ?? []) {
      const cid = r?.parsed?.telegram_chat_id;
      if (cid) chatIds.add(String(cid));
    }

    if (chatIds.size === 0) {
      return json(res, 200, { ok: true, msg: "No telegram chats discovered yet." });
    }

    // Pull tasks
    const { data: taskRows, error: taskErr } = await supabase
      .from("lines")
      .select("raw, parsed, created_at")
      .eq("bucket", "tasks")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (taskErr) return json(res, 500, { error: taskErr.message });

    const allTasks = taskRows ?? [];
    const openTasks = allTasks.filter((t: any) => t?.parsed?.done !== true);
    const dueToday = openTasks.filter((t: any) => t?.parsed?.due === today);
    const overdue = openTasks.filter((t: any) => {
      const due = t?.parsed?.due;
      return typeof due === "string" && due < today;
    });

    let msgText: string;

    if (briefType === "evening") {
      msgText = buildEveningBrief(today, tomorrow, allTasks, openTasks);
    } else {
      // Fetch inbox count (only needed for morning)
      const { data: inboxRows, error: inboxErr } = await supabase
        .from("lines")
        .select("id")
        .eq("bucket", "inbox");
      if (inboxErr) return json(res, 500, { error: inboxErr.message });
      const inboxCount = (inboxRows ?? []).length;
      msgText = buildMorningBrief(today, inboxCount, openTasks, dueToday, overdue);
    }

    for (const cid of chatIds) {
      await tgSendMessage(cid, msgText);
    }

    return json(res, 200, { ok: true, type: briefType, sent_to: Array.from(chatIds), today });
  } catch (e: any) {
    console.error(e);
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
