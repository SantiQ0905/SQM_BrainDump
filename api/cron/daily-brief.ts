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

    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false },
    });

    const today = ymdInTZ(new Date(), TZ);

    // Discover chat IDs from existing telegram lines (solo use => usually 1)
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

    // Pull tasks (open = parsed.done !== true)
    const { data: taskRows, error: taskErr } = await supabase
      .from("lines")
      .select("raw, parsed, created_at")
      .eq("bucket", "tasks")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (taskErr) return json(res, 500, { error: taskErr.message });

    const { data: inboxRows, error: inboxErr } = await supabase
      .from("lines")
      .select("id")
      .eq("bucket", "inbox");

    if (inboxErr) return json(res, 500, { error: inboxErr.message });

    const openTasks = (taskRows ?? []).filter((t: any) => t?.parsed?.done !== true);
    const dueToday = openTasks.filter((t: any) => t?.parsed?.due === today);
    const overdue = openTasks.filter((t: any) => {
      const due = t?.parsed?.due;
      return typeof due === "string" && due < today;
    });

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

    const inboxCount = (inboxRows ?? []).length;

    const out: string[] = [];
    out.push(`Daily brief (${today})`);
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

    const msgText = out.join("\n");

    for (const cid of chatIds) {
      await tgSendMessage(cid, msgText);
    }

    return json(res, 200, { ok: true, sent_to: Array.from(chatIds), today });
  } catch (e: any) {
    console.error(e);
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
