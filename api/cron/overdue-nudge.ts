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

async function tgSendMessage(chatId: string, text: string) {
  const token = getEnv("TELEGRAM_BOT_TOKEN");
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  }).catch(() => {});
}

// Sends a once-per-day nudge listing overdue (past-due, open) tasks.
// Scheduled to run at ~1 PM Monterrey (19 UTC).
// DST guard keeps it between 12–15 local.

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

    // Guard: only run between 11 AM – 3 PM local (accommodates DST ±1)
    const localHour = getLocalHour(TZ);
    if (localHour < 11 || localHour > 15) {
      return json(res, 200, { ok: true, skipped: true, reason: `hour=${localHour}, outside nudge window` });
    }

    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false },
    });

    const today = ymdInTZ(new Date(), TZ);
    const nudgeType = `overdue_nudge_${today}`;

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

    // Check deduplication: only nudge once per day
    const { data: alreadySent } = await supabase
      .from("notifications_sent")
      .select("id")
      .eq("type", nudgeType)
      .limit(1);

    if (alreadySent && alreadySent.length > 0) {
      return json(res, 200, { ok: true, skipped: true, reason: "Already nudged today" });
    }

    // Query overdue open tasks
    const { data: tasks, error: taskErr } = await supabase
      .from("lines")
      .select("id, raw, parsed")
      .eq("bucket", "tasks")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (taskErr) return json(res, 500, { error: taskErr.message });

    const overdue = (tasks ?? []).filter((t: any) => {
      const due = t?.parsed?.due;
      return t?.parsed?.done !== true && typeof due === "string" && due < today;
    });

    if (!overdue.length) {
      return json(res, 200, { ok: true, msg: "No overdue tasks" });
    }

    // Sort by due date (oldest first)
    overdue.sort((a: any, b: any) =>
      String(a.parsed?.due ?? "").localeCompare(String(b.parsed?.due ?? ""))
    );

    const lines: string[] = [];
    lines.push(`Overdue nudge — ${overdue.length} task${overdue.length > 1 ? "s" : ""} overdue:`);
    for (const t of overdue.slice(0, 10)) {
      const due = t.parsed?.due ?? "?";
      const pr = t.parsed?.priority ? ` !${t.parsed.priority}` : "";
      lines.push(`- ${t.raw.slice(0, 60)} ^${due}${pr}`);
    }
    if (overdue.length > 10) lines.push(`…and ${overdue.length - 10} more.`);
    lines.push("\nReview and reschedule or mark done.");

    const msg = lines.join("\n");

    for (const cid of chatIds) {
      await tgSendMessage(cid, msg);

      await supabase.from("notifications_sent").insert({
        line_id: tasks![0]?.id ?? "00000000-0000-0000-0000-000000000000",
        type: nudgeType,
        chat_id: cid,
      });
    }

    return json(res, 200, { ok: true, overdue: overdue.length, sent_to: chatIds });
  } catch (e: any) {
    console.error(e);
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
