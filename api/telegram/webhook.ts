import { createClient } from "@supabase/supabase-js";

/* ──────────────────────────────────────────────────────────────
   Parser (inlined to avoid Vercel module-resolution issues)
   ────────────────────────────────────────────────────────────── */

type Bucket = "inbox" | "tasks" | "notes" | "links" | "journal" | "archive";

const BUCKET_PREFIX: Record<string, Bucket> = {
  "i:": "inbox",
  "t:": "tasks",
  "n:": "notes",
  "l:": "links",
  "j:": "journal",
  "a:": "archive",
};

function normalizeLine(s: string) {
  return s.trim();
}

function extractAll(pattern: RegExp, text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"
  );
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

/** Accept ^YYYY-MM-DD, ^DD-MM-YYYY, or ^DD-MM (assumes current year). */
function parseDue(raw: string): string | null {
  const iso = raw.match(/\^(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = raw.match(/\^(\d{1,2})-(\d{1,2})-(\d{4})\b/);
  if (dmy)
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;

  const dm = raw.match(/\^(\d{1,2})-(\d{1,2})(?!\d)/);
  if (dm) {
    const year = new Date().getFullYear();
    return `${year}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
  }

  return null;
}

function splitIntoLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/* ──────────────────────────────────────────────────────────────
   Smart normalization (still text-first; just faster typing)
   - ^today / ^tomorrow
   - !high/!med/!low -> !1/!2/!3
   - if bucket=tasks and no checkbox => prepend "[ ] "
   ────────────────────────────────────────────────────────────── */

const TZ = "America/Monterrey";

function ymdInTZ(d: Date, tz: string): string {
  // returns YYYY-MM-DD in tz
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

function normalizeShortcuts(raw: string, bucket: Bucket): string {
  let s = raw;

  // ^today / ^tomorrow (timezone-aware date)
  const today = ymdInTZ(new Date(), TZ);
  const tomorrow = ymdInTZ(addDays(new Date(), 1), TZ);

  s = s.replace(/\^today\b/gi, `^${today}`);
  s = s.replace(/\^tomorrow\b/gi, `^${tomorrow}`);

  // priority words
  s = s.replace(/!high\b/gi, "!1");
  s = s.replace(/!med\b/gi, "!2");
  s = s.replace(/!low\b/gi, "!3");

  // If tasks and no checkbox token, auto add "[ ] "
  if (bucket === "tasks" && !/\[(x| )\]/i.test(s)) {
    s = `[ ] ${s}`;
  }

  return s;
}

function parseLine(input: string, defaultBucket: Bucket = "inbox") {
  const raw0 = normalizeLine(input);
  if (!raw0) return null;

  const head = raw0.slice(0, 2).toLowerCase();
  const bucket = BUCKET_PREFIX[head] ?? defaultBucket;

  // Remove prefix if present
  let raw = BUCKET_PREFIX[head] ? normalizeLine(raw0.slice(2)) : raw0;

  // Apply shortcut normalization AFTER routing bucket is known
  raw = normalizeShortcuts(raw, bucket);

  const tags = extractAll(/#([a-zA-Z0-9_-]+)/g, raw).map((t) => t.toLowerCase());
  const projects = extractAll(/@([a-zA-Z0-9_-]+)/g, raw).map((p) => p.toLowerCase());
  const due = parseDue(raw);
  const priority = raw.match(/!(1|2|3)\b/)?.[1] ?? null;

  const doneToken = raw.match(/\[(x| )\]/i)?.[1] ?? null;
  const done = doneToken ? doneToken.toLowerCase() === "x" : null;

  const urls = extractAll(/\b(https?:\/\/[^\s)]+)\b/g, raw);

  const parsed = {
    tags,
    project: projects.length ? projects[0] : null,
    projects,
    due,
    priority: priority ? Number(priority) : null,
    done,
    urls,
  };

  return { bucket, raw, parsed };
}

/* ──────────────────────────────────────────────────────────────
   Telegram helpers
   ────────────────────────────────────────────────────────────── */

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

async function tgSendMessage(chatId: string | number, text: string, opts?: any) {
  const token = getEnv("TELEGRAM_BOT_TOKEN");
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(opts ?? {}),
    }),
  });

  // Don’t crash ingestion if Telegram reply fails.
  // Just log.
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    console.error("Telegram sendMessage failed:", r.status, t);
  }
}

function smartKeyboard() {
  // “Autocomplete” via tap buttons (Telegram’s best UX for this)
  return {
    keyboard: [
      [{ text: "t:" }, { text: "n:" }, { text: "l:" }, { text: "j:" }, { text: "i:" }],
      [{ text: "[ ]" }, { text: "[x]" }, { text: "!1" }, { text: "!2" }, { text: "!3" }],
      [{ text: "^today" }, { text: "^tomorrow" }, { text: "#tag" }, { text: "@project" }],
      [{ text: "/brief" }, { text: "/last" }, { text: "/help" }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
    input_field_placeholder: "Dump a line…",
  };
}

/* ──────────────────────────────────────────────────────────────
   Cron: daily brief (Tier 3)
   - Called by Vercel Cron as GET:
     /api/telegram/webhook?cron=daily-brief
   - Must include header: x-cron-secret == CRON_SECRET
   ────────────────────────────────────────────────────────────── */

async function handleDailyBrief(req: any, res: any) {
  const cronSecret = req.headers["x-cron-secret"];
  if (!cronSecret || cronSecret !== getEnv("CRON_SECRET")) {
    return json(res, 401, { error: "Unauthorized cron" });
  }

  const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });

  const today = ymdInTZ(new Date(), TZ);

  // 1) Determine who to message:
  // We’ll message all distinct chat IDs that have ever sent a telegram line.
  // (Solo use => usually one chat)
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

  // 2) Build brief from TASKS + INBOX
  // Fetch a reasonable slice (you can raise later)
  const { data: taskRows, error: taskErr } = await supabase
    .from("lines")
    .select("id, raw, parsed, created_at")
    .eq("bucket", "tasks")
    .order("created_at", { ascending: false })
    .limit(2000);

  if (taskErr) return json(res, 500, { error: taskErr.message });

  const { data: inboxRows, error: inboxErr } = await supabase
    .from("lines")
    .select("id")
    .eq("bucket", "inbox");

  if (inboxErr) return json(res, 500, { error: inboxErr.message });

  const openTasks = (taskRows ?? []).filter((t: any) => {
    const done = t?.parsed?.done;
    // done can be null if no checkbox; treat as open
    return done !== true;
  });

  const dueToday = openTasks.filter((t: any) => t?.parsed?.due === today);
  const overdue = openTasks.filter((t: any) => {
    const due = t?.parsed?.due;
    return typeof due === "string" && due < today;
  });

  // Top priorities: !1 then !2
  const top = openTasks
    .slice()
    .sort((a: any, b: any) => {
      const pa = a?.parsed?.priority ?? 99;
      const pb = b?.parsed?.priority ?? 99;
      if (pa !== pb) return pa - pb;
      // earlier due first
      const da = a?.parsed?.due ?? "9999-12-31";
      const db = b?.parsed?.due ?? "9999-12-31";
      return da.localeCompare(db);
    })
    .slice(0, 5);

  const inboxCount = (inboxRows ?? []).length;

  const lines: string[] = [];
  lines.push(`Daily brief (${today})`);
  lines.push(`Inbox: ${inboxCount}`);
  lines.push(`Due today: ${dueToday.length} • Overdue: ${overdue.length}`);
  if (top.length) {
    lines.push("");
    lines.push("Top tasks:");
    for (const t of top) {
      const due = t?.parsed?.due ? ` ^${t.parsed.due}` : "";
      const pr = t?.parsed?.priority ? ` !${t.parsed.priority}` : "";
      lines.push(`- ${t.raw}${due}${pr}`);
    }
  }

  const msgText = lines.join("\n");

  // 3) Send to all discovered chats
  for (const cid of chatIds) {
    await tgSendMessage(cid, msgText);
  }

  return json(res, 200, { ok: true, sent_to: Array.from(chatIds) });
}

/* ──────────────────────────────────────────────────────────────
   Commands (webhook-based)
   ────────────────────────────────────────────────────────────── */

async function handleCommand(chatId: string | number, text: string, supabase: any) {
  const cmd = text.trim().split(/\s+/)[0].toLowerCase();

  if (cmd === "/help" || cmd === "/start") {
    const help = [
      "Brain Dump bot ✅",
      "",
      "Routing:",
      "i: inbox (default)",
      "t: tasks",
      "n: notes",
      "l: links",
      "j: journal",
      "a: archive",
      "",
      "Tokens:",
      "[ ] open task, [x] done",
      "!1 !2 !3 priority",
      "^YYYY-MM-DD due",
      "^today, ^tomorrow shortcuts",
      "#tag @project",
      "",
      "Commands:",
      "/brief  (daily-style summary now)",
      "/last   (last 10 telegram captures)",
      "",
      "Tip: paste multiple lines — I’ll split them.",
    ].join("\n");

    await tgSendMessage(chatId, help, { reply_markup: smartKeyboard() });
    return true;
  }

  if (cmd === "/brief") {
    // generate a brief immediately (same logic as cron, but only to this chat)
    const today = ymdInTZ(new Date(), TZ);

    const { data: taskRows } = await supabase
      .from("lines")
      .select("raw, parsed, created_at")
      .eq("bucket", "tasks")
      .order("created_at", { ascending: false })
      .limit(2000);

    const { data: inboxRows } = await supabase
      .from("lines")
      .select("id")
      .eq("bucket", "inbox");

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
        return da.localeCompare(db);
      })
      .slice(0, 5);

    const inboxCount = (inboxRows ?? []).length;

    const out: string[] = [];
    out.push(`Brief (${today})`);
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

    await tgSendMessage(chatId, out.join("\n"), { reply_markup: smartKeyboard() });
    return true;
  }

  if (cmd === "/last") {
    const { data } = await supabase
      .from("lines")
      .select("bucket, raw, created_at, parsed")
      .eq("source", "telegram")
      .order("created_at", { ascending: false })
      .limit(10);

    const items = (data ?? []).map((r: any) => `- (${r.bucket}) ${r.raw}`);
    const msg = items.length ? `Last captures:\n${items.join("\n")}` : "No captures yet.";

    await tgSendMessage(chatId, msg, { reply_markup: smartKeyboard() });
    return true;
  }

  return false;
}

/* ──────────────────────────────────────────────────────────────
   Handler
   ────────────────────────────────────────────────────────────── */

export default async function handler(req: any, res: any) {
  try {
    // Tier 3 cron mode (GET)
    if (req.method === "GET" && req.query?.cron === "daily-brief") {
      return await handleDailyBrief(req, res);
    }

    // Telegram webhook mode (POST)
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("allow", "POST, GET");
      return res.end();
    }

    // Validate Telegram secret token header
    const secret = req.headers["x-telegram-bot-api-secret-token"];
    if (!secret || secret !== getEnv("TELEGRAM_SECRET")) {
      return json(res, 401, { error: "Unauthorized" });
    }

    // Body parsing safety (Vercel sometimes gives string)
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    const msg = body.message;

    const chatId = msg?.chat?.id;
    if (!chatId) return json(res, 200, { ok: true, inserted: 0 });

    // Support text + captions
    const text: string = msg?.text ?? msg?.caption ?? "";
    if (!text.trim()) return json(res, 200, { ok: true, inserted: 0 });

    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false },
    });

    // Commands
    if (text.trim().startsWith("/")) {
      const handled = await handleCommand(chatId, text, supabase);
      return json(res, 200, { ok: true, command: handled });
    }

    const userId = msg?.from?.id?.toString?.() ?? null;
    const chatIdStr = chatId?.toString?.() ?? null;

    const lines = splitIntoLines(text);

    const counts: Record<Bucket, number> = {
      inbox: 0,
      tasks: 0,
      notes: 0,
      links: 0,
      journal: 0,
      archive: 0,
    };

    const rows = lines
      .map((l) => parseLine(l, "inbox"))
      .filter(Boolean)
      .map((p: any) => {
        counts[p.bucket as Bucket] += 1;
        return {
          bucket: p.bucket,
          raw: p.raw,
          source: "telegram",
          parsed: { ...p.parsed, telegram_chat_id: chatIdStr, telegram_user_id: userId },
        };
      });

    if (!rows.length) return json(res, 200, { ok: true, inserted: 0 });

    const { error } = await supabase.from("lines").insert(rows);
    if (error) return json(res, 500, { error: error.message });

    // Confirmation message + routing summary + keyboard
    const summaryParts: string[] = [];
    for (const b of Object.keys(counts) as Bucket[]) {
      if (counts[b] > 0) summaryParts.push(`${b}:${counts[b]}`);
    }

    const confirm = `Captured ✅\n${summaryParts.join(" • ")}`;
    await tgSendMessage(chatId, confirm, { reply_markup: smartKeyboard() });

    return json(res, 200, { ok: true, inserted: rows.length });
  } catch (e: any) {
    console.error(e);
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
