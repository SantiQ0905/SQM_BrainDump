import { createClient } from "@supabase/supabase-js";

/* ──────────────────────────────────────────────────────────────
   Parser (inlined to avoid Vercel module-resolution issues)
   ────────────────────────────────────────────────────────────── */

type Bucket = "inbox" | "tasks" | "notes" | "links" | "journal" | "archive" | "habits" | "mood";

const BUCKET_PREFIX: Record<string, Bucket> = {
  "i:": "inbox",
  "t:": "tasks",
  "n:": "notes",
  "l:": "links",
  "j:": "journal",
  "a:": "archive",
  "h:": "habits",
  "m:": "mood",
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

/** Accept ^YYYY-MM-DD, ^DD-MM-YYYY, or ^DD-MM (assumes current year).
 *  Optional @HH:MM suffix for time-of-day (e.g. ^today@14:30). */
function parseDue(raw: string): { due: string | null; due_time: string | null } {
  let due_time: string | null = null;

  function extractTime(m: RegExpMatchArray, timeGroup: number): void {
    const hh = m[timeGroup];
    const mm = m[timeGroup + 1];
    if (hh !== undefined && mm !== undefined) {
      due_time = `${hh}:${mm}`;
    }
  }

  // ISO: ^2026-02-15 or ^2026-02-15@14:30
  const iso = raw.match(/\^(\d{4})-(\d{2})-(\d{2})(?:@(\d{2}):(\d{2}))?(?!\d)/);
  if (iso) {
    extractTime(iso, 4);
    return { due: `${iso[1]}-${iso[2]}-${iso[3]}`, due_time };
  }

  // DD-MM-YYYY: ^15-02-2026 or ^15-02-2026@09:00
  const dmy = raw.match(/\^(\d{1,2})-(\d{1,2})-(\d{4})(?:@(\d{2}):(\d{2}))?(?!\d)/);
  if (dmy) {
    extractTime(dmy, 4);
    return { due: `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`, due_time };
  }

  // DD-MM: ^15-02 or ^15-02@09:00 (assumes current year)
  const dm = raw.match(/\^(\d{1,2})-(\d{1,2})(?:@(\d{2}):(\d{2}))?(?!\d)/);
  if (dm) {
    const year = new Date().getFullYear();
    extractTime(dm, 3);
    return { due: `${year}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`, due_time };
  }

  return { due: null, due_time: null };
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
const VALID_ACCOUNTS = ["AMEX", "NUCredit", "NUDebit", "ScotiabankDebit"];
function normalizeAccount(raw: string): string | null {
  return VALID_ACCOUNTS.find((a) => a.toLowerCase() === raw.toLowerCase()) ?? null;
}

const CREDIT_CARDS: Record<string, { limit: number; cutDay: number }> = {
  AMEX:     { limit: 10000, cutDay: 4 },
  NUCredit: { limit:  6000, cutDay: 6 },
};

function nextCutInfo(cutDay: number, today: string): { date: string; daysAway: number } {
  const [y, m, d] = today.split("-").map(Number);
  let cy = y, cm = m;
  if (d > cutDay) { cm++; if (cm > 12) { cm = 1; cy++; } }
  const daysAway = Math.round(
    (new Date(cy, cm - 1, cutDay).getTime() - new Date(y, m - 1, d).getTime()) / 86400000
  );
  return { date: `${cy}-${String(cm).padStart(2, "0")}-${String(cutDay).padStart(2, "0")}`, daysAway };
}

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

function ymInTZ(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
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
  const projects = extractAll(/@(?!\d{2}:\d{2})([a-zA-Z0-9_-]+)/g, raw).map((p) => p.toLowerCase());
  const { due, due_time } = parseDue(raw);
  const priority = raw.match(/!(1|2|3)\b/)?.[1] ?? null;

  const doneToken = raw.match(/\[(x| )\]/i)?.[1] ?? null;
  const done = doneToken ? doneToken.toLowerCase() === "x" : null;

  const urls = extractAll(/\b(https?:\/\/[^\s)]+)\b/g, raw);

  const parsed = {
    tags,
    project: projects.length ? projects[0] : null,
    projects,
    due,
    due_time: due ? due_time : null,
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

function setCheckbox(raw: string, done: boolean) {
  if (/\[(x| )\]/i.test(raw)) {
    return raw.replace(/\[(x| )\]/i, done ? "[x]" : "[ ]");
  }
  return (done ? "[x] " : "[ ] ") + raw;
}

function smartKeyboard() {
  // "Autocomplete" via tap buttons (Telegram's best UX for this)
  return {
    keyboard: [
      [{ text: "t:" }, { text: "n:" }, { text: "l:" }, { text: "j:" }, { text: "i:" }],
      [{ text: "[ ]" }, { text: "[x]" }, { text: "!1" }, { text: "!2" }, { text: "!3" }],
      [{ text: "^today" }, { text: "^tomorrow" }, { text: "#tag" }, { text: "@project" }],
      [{ text: "/brief" }, { text: "/projects" }, { text: "/done" }, { text: "/del" }, { text: "/help" }],
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
      "t: tasks  n: notes  l: links",
      "j: journal  a: archive",
      "",
      "Tokens:",
      "[ ] open task, [x] done",
      "!1 !2 !3 priority",
      "^YYYY-MM-DD due (+ @HH:MM for time)",
      "^today@14:30, ^tomorrow@09:00",
      "#tag @project",
      "",
      "Habit Tracker:",
      "HT: 1-YES, 2-NO, 3-YES  (log today's habits)",
      "HT: 1 3 5  (shorthand: those are YES, rest NO)",
      "",
      "Mood Tracker:",
      "MD: 4  (log today's mood, scale 1-5)",
      "",
      "Commands:",
      "/brief            full summary",
      "/brief @project   filter by project",
      "/brief #tag       filter by tag",
      "/projects         list all projects",
      "/last             last 10 captures",
      "/done [N]         toggle task done",
      "/del N            delete item",
      "/habits           show today's habit list",
      "/listhabits       list all configured habits",
      "/addhabit X       add a new habit",
      "/mood             show mood prompt",
      "/streak           show streaks & stats",
      "/budget           show this month's cashflow",
      "",
      "Budget: BM: +$5000 @earnings Salary #ScotiabankDebit",
      "        BM: -$300 @food Groceries #NUDebit",
      "",
      "Tip: paste multiple lines — I'll split them.",
    ].join("\n");

    await tgSendMessage(chatId, help, { reply_markup: smartKeyboard() });
    return true;
  }

  if (cmd === "/brief") {
    const args = text.trim().slice("/brief".length).trim();
    const projectFilter = args.match(/@([a-zA-Z0-9_-]+)/)?.[1]?.toLowerCase() ?? null;
    const tagFilter = args.match(/#([a-zA-Z0-9_-]+)/)?.[1]?.toLowerCase() ?? null;

    const today = ymdInTZ(new Date(), TZ);

    // Build query — apply JSONB filter if needed
    let taskQuery = supabase
      .from("lines")
      .select("raw, parsed, created_at")
      .eq("bucket", "tasks")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (projectFilter) {
      taskQuery = taskQuery.filter("parsed->>project", "eq", projectFilter);
    } else if (tagFilter) {
      taskQuery = taskQuery.filter("parsed->tags", "cs", `["${tagFilter}"]`);
    }

    const { data: taskRows } = await taskQuery;
    const openTasks = (taskRows ?? []).filter((t: any) => t?.parsed?.done !== true);

    // ── Filtered view ──────────────────────────────────────────────
    if (projectFilter || tagFilter) {
      const filterLabel = projectFilter ? `@${projectFilter}` : `#${tagFilter}`;
      const dueToday = openTasks.filter((t: any) => t?.parsed?.due === today);
      const overdue = openTasks.filter((t: any) => {
        const due = t?.parsed?.due;
        return typeof due === "string" && due < today;
      });

      const sorted = openTasks.slice().sort((a: any, b: any) => {
        const pa = a?.parsed?.priority ?? 99;
        const pb = b?.parsed?.priority ?? 99;
        if (pa !== pb) return pa - pb;
        const da = a?.parsed?.due ?? "9999-12-31";
        const db = b?.parsed?.due ?? "9999-12-31";
        return da.localeCompare(db);
      });

      const out: string[] = [];
      out.push(`Tasks ${filterLabel} (${today})`);
      out.push(`Open: ${openTasks.length} • Due today: ${dueToday.length} • Overdue: ${overdue.length}`);

      if (sorted.length === 0) {
        out.push("\nNo open tasks.");
      } else {
        out.push("");
        for (const t of sorted.slice(0, 20)) {
          const due = t?.parsed?.due ? ` ^${t.parsed.due}` : "";
          const pr = t?.parsed?.priority ? ` !${t.parsed.priority}` : "";
          const overdueMark = t?.parsed?.due && t.parsed.due < today ? " ⚠" : "";
          out.push(`• ${t.raw}${due}${pr}${overdueMark}`);
        }
        if (sorted.length > 20) {
          out.push(`\n… and ${sorted.length - 20} more`);
        }
      }

      await tgSendMessage(chatId, out.join("\n"), { reply_markup: smartKeyboard() });
      return true;
    }

    // ── Default full brief ─────────────────────────────────────────
    const { data: inboxRows } = await supabase
      .from("lines")
      .select("id")
      .eq("bucket", "inbox");

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

  if (cmd === "/projects") {
    const { data: taskRows } = await supabase
      .from("lines")
      .select("parsed")
      .eq("bucket", "tasks")
      .not("parsed->>project", "is", null)
      .limit(2000);

    const projectCounts: Record<string, { open: number; done: number }> = {};
    for (const row of taskRows ?? []) {
      const p = row.parsed?.project;
      if (!p) continue;
      if (!projectCounts[p]) projectCounts[p] = { open: 0, done: 0 };
      if (row.parsed?.done === true) {
        projectCounts[p].done++;
      } else {
        projectCounts[p].open++;
      }
    }

    const projects = Object.entries(projectCounts).sort((a, b) => b[1].open - a[1].open);

    if (!projects.length) {
      await tgSendMessage(chatId, "No projects found. Tag tasks with @projectname to organize them.", { reply_markup: smartKeyboard() });
      return true;
    }

    const out: string[] = ["Projects (open tasks):"];
    for (const [name, counts] of projects) {
      const bar = counts.open > 0 ? `${counts.open} open` : "all done";
      const doneStr = counts.done > 0 ? ` • ${counts.done} done` : "";
      out.push(`@${name}: ${bar}${doneStr}`);
    }
    out.push("\nTip: /brief @projectname to filter");

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

  if (cmd === "/del") {
    const parts = text.trim().split(/\s+/);
    const n = parseInt(parts[1] ?? "", 10);
    if (!n || n < 1) {
      await tgSendMessage(chatId, "Usage: /del N (e.g. /del 1 to delete the most recent item)", { reply_markup: smartKeyboard() });
      return true;
    }

    const chatIdStr = String(chatId);
    const { data, error: qErr } = await supabase
      .from("lines")
      .select("id, raw, bucket")
      .filter("parsed->telegram_chat_id", "eq", `"${chatIdStr}"`)
      .order("created_at", { ascending: false })
      .limit(n);

    if (qErr) {
      await tgSendMessage(chatId, `Error: ${qErr.message}`);
      return true;
    }

    if (!data || data.length < n) {
      await tgSendMessage(chatId, `Only ${data?.length ?? 0} items found from this chat.`, { reply_markup: smartKeyboard() });
      return true;
    }

    const target = data[n - 1];
    const { error: delErr } = await supabase.from("lines").delete().eq("id", target.id);
    if (delErr) {
      await tgSendMessage(chatId, `Delete failed: ${delErr.message}`);
      return true;
    }

    await tgSendMessage(chatId, `Deleted (${target.bucket}): ${target.raw}`, { reply_markup: smartKeyboard() });
    return true;
  }

  if (cmd === "/done") {
    const parts = text.trim().split(/\s+/);
    const n = parseInt(parts[1] ?? "1", 10);
    if (n < 1) {
      await tgSendMessage(chatId, "Usage: /done or /done N", { reply_markup: smartKeyboard() });
      return true;
    }

    const chatIdStr = String(chatId);
    const { data, error: qErr } = await supabase
      .from("lines")
      .select("id, raw, parsed")
      .eq("bucket", "tasks")
      .filter("parsed->telegram_chat_id", "eq", `"${chatIdStr}"`)
      .order("created_at", { ascending: false })
      .limit(n);

    if (qErr) {
      await tgSendMessage(chatId, `Error: ${qErr.message}`);
      return true;
    }

    if (!data || data.length < n) {
      await tgSendMessage(chatId, `Only ${data?.length ?? 0} tasks found from this chat.`, { reply_markup: smartKeyboard() });
      return true;
    }

    const target = data[n - 1];
    const currentDone = target.parsed?.done === true;
    const newDone = !currentDone;
    const newRaw = setCheckbox(target.raw, newDone);
    const newParsed = { ...(target.parsed ?? {}), done: newDone };

    const { error: updErr } = await supabase
      .from("lines")
      .update({ raw: newRaw, parsed: newParsed })
      .eq("id", target.id);

    if (updErr) {
      await tgSendMessage(chatId, `Update failed: ${updErr.message}`);
      return true;
    }

    const status = newDone ? "done" : "open";
    await tgSendMessage(chatId, `Task marked ${status}: ${newRaw}`, { reply_markup: smartKeyboard() });
    return true;
  }

  // ── /listhabits ────────────────────────────────────────────────
  if (cmd === "/listhabits") {
    const { data: habits } = await supabase
      .from("habit_definitions")
      .select("*")
      .order("sort_order", { ascending: true });

    if (!habits || habits.length === 0) {
      await tgSendMessage(chatId, "No habits configured yet. Use /addhabit <name> to add one.", { reply_markup: smartKeyboard() });
      return true;
    }

    const lines: string[] = ["Your habits:"];
    for (const h of habits) {
      const status = h.active ? "✓" : "✗";
      lines.push(`${status} ${h.sort_order}. ${h.name} [${h.id.slice(0, 8)}]`);
    }
    lines.push("\n✓=active ✗=inactive");
    await tgSendMessage(chatId, lines.join("\n"), { reply_markup: smartKeyboard() });
    return true;
  }

  // ── /addhabit <name> ───────────────────────────────────────────
  if (cmd === "/addhabit") {
    const name = text.trim().slice("/addhabit".length).trim();
    if (!name) {
      await tgSendMessage(chatId, "Usage: /addhabit <habit name>\nExample: /addhabit Read 30 minutes", { reply_markup: smartKeyboard() });
      return true;
    }

    const { data: existing } = await supabase
      .from("habit_definitions")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);

    const maxOrder = (existing?.[0]?.sort_order ?? 0) + 1;

    const { error } = await supabase
      .from("habit_definitions")
      .insert({ name, sort_order: maxOrder });

    if (error) {
      await tgSendMessage(chatId, `Failed to add habit: ${error.message}`);
      return true;
    }

    await tgSendMessage(chatId, `Habit added: "${name}" (position ${maxOrder})`, { reply_markup: smartKeyboard() });
    return true;
  }

  // ── /habits ────────────────────────────────────────────────────
  if (cmd === "/habits") {
    const today = ymdInTZ(new Date(), TZ);

    const [{ data: habits }, { data: logs }] = await Promise.all([
      supabase
        .from("habit_definitions")
        .select("id, name, sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("lines")
        .select("parsed")
        .eq("bucket", "habits")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const activeHabits = habits ?? [];
    if (!activeHabits.length) {
      await tgSendMessage(chatId, "No active habits. Use /addhabit <name> to configure.", { reply_markup: smartKeyboard() });
      return true;
    }

    const todayLog = (logs ?? []).find((r: any) => r.parsed?.date === today);
    const todayResults = todayLog?.parsed?.results ?? {};

    const lines: string[] = [`Habit Check-in (${today}):`];
    for (const h of activeHabits) {
      const done = todayResults[h.id];
      const icon = done === true ? "✓" : done === false ? "✗" : "○";
      lines.push(`${icon} ${h.sort_order}. ${h.name}`);
    }

    if (todayLog) {
      const doneCount = activeHabits.filter((h: any) => todayResults[h.id] === true).length;
      lines.push(`\nToday: ${doneCount}/${activeHabits.length} done ✅`);
    } else {
      lines.push("\nReply: HT: 1-YES, 2-NO, 3-YES...");
    }

    await tgSendMessage(chatId, lines.join("\n"), { reply_markup: smartKeyboard() });
    return true;
  }

  // ── /mood ──────────────────────────────────────────────────────
  if (cmd === "/mood") {
    const today = ymdInTZ(new Date(), TZ);

    const { data: logs } = await supabase
      .from("lines")
      .select("parsed")
      .eq("bucket", "mood")
      .order("created_at", { ascending: false })
      .limit(10);

    const todayLog = (logs ?? []).find((r: any) => r.parsed?.date === today);

    if (todayLog) {
      await tgSendMessage(chatId, `Today's mood already logged: ${todayLog.parsed?.score}/5 ✓\nTo update, reply: MD: <1-5>`, { reply_markup: smartKeyboard() });
    } else {
      await tgSendMessage(chatId, `Mood check: How was today?\n1=Terrible  2=Bad  3=OK  4=Good  5=Great\nReply: MD: 4`, { reply_markup: smartKeyboard() });
    }
    return true;
  }

  // ── /streak ────────────────────────────────────────────────────
  if (cmd === "/streak") {
    const today = ymdInTZ(new Date(), TZ);
    const monthPrefix = today.slice(0, 7); // "YYYY-MM"

    const [{ data: habitLogs }, { data: habitDefs }, { data: moodLogs }, { data: taskRows }] = await Promise.all([
      supabase
        .from("lines")
        .select("parsed")
        .eq("bucket", "habits")
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("habit_definitions")
        .select("id, name, sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("lines")
        .select("parsed")
        .eq("bucket", "mood")
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("lines")
        .select("parsed, created_at")
        .eq("bucket", "tasks")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    function computeStreak(dates: string[]): number {
      if (!dates.length) return 0;
      const dateSet = new Set(dates);
      let cursor = today;
      if (!dateSet.has(cursor)) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        cursor = ymdInTZ(yesterday, TZ);
        if (!dateSet.has(cursor)) return 0;
      }
      let streak = 0;
      let d = new Date(cursor + "T12:00:00Z");
      while (true) {
        const ymd = ymdInTZ(d, TZ);
        if (!dateSet.has(ymd)) break;
        streak++;
        d.setDate(d.getDate() - 1);
      }
      return streak;
    }

    const habitStreak = computeStreak(
      (habitLogs ?? []).map((r: any) => r.parsed?.date).filter(Boolean)
    );
    const moodStreak = computeStreak(
      (moodLogs ?? []).map((r: any) => r.parsed?.date).filter(Boolean)
    );

    const last7Mood = (moodLogs ?? []).slice(0, 7).map((r: any) => r.parsed?.score).filter(Boolean);
    const moodAvg = last7Mood.length
      ? (last7Mood.reduce((a: number, b: number) => a + b, 0) / last7Mood.length).toFixed(1)
      : "–";

    const recentTasks = (taskRows ?? []).filter((t: any) => {
      const d = t.created_at?.slice(0, 10) ?? "";
      const ago = new Date();
      ago.setDate(ago.getDate() - 30);
      return d >= ymdInTZ(ago, TZ);
    });
    const doneTasks = recentTasks.filter((t: any) => t?.parsed?.done === true).length;
    const rate = recentTasks.length
      ? Math.round((doneTasks / recentTasks.length) * 100)
      : 0;

    // Monthly habit progress: count how many days this month each habit was done
    const thisMonthLogs = (habitLogs ?? []).filter((r: any) =>
      typeof r.parsed?.date === "string" && r.parsed.date.startsWith(monthPrefix)
    );
    const daysLoggedThisMonth = thisMonthLogs.length;
    const activeHabits: any[] = habitDefs ?? [];

    const monthlyProgress = activeHabits.map((h: any) => {
      const doneCount = thisMonthLogs.filter((r: any) => r.parsed?.results?.[h.id] === true).length;
      const pct = daysLoggedThisMonth > 0 ? Math.round((doneCount / daysLoggedThisMonth) * 100) : 0;
      const bar = doneCount === daysLoggedThisMonth && daysLoggedThisMonth > 0 ? "✓" : "○";
      return `${bar} ${h.name}: ${doneCount}/${daysLoggedThisMonth}d (${pct}%)`;
    });

    const lines = [
      `Streaks & Stats (${today}):`,
      ``,
      `Habit streak:   ${habitStreak} day${habitStreak !== 1 ? "s" : ""}`,
      `Mood streak:    ${moodStreak} day${moodStreak !== 1 ? "s" : ""}`,
      `Mood avg (7d):  ${moodAvg}/5`,
      `Task done (30d): ${doneTasks}/${recentTasks.length} (${rate}%)`,
    ];

    if (monthlyProgress.length > 0) {
      lines.push(``, `Monthly habits (${monthPrefix}):`, ...monthlyProgress);
    }

    await tgSendMessage(chatId, lines.join("\n"), { reply_markup: smartKeyboard() });
    return true;
  }

  // ── /budget ────────────────────────────────────────────────────
  if (cmd === "/budget") {
    const thisMonth = ymInTZ(new Date(), TZ);
    const monthStart = `${thisMonth}-01`;
    const [y, mo] = thisMonth.split("-").map(Number);
    const nextMonth = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;

    const [{ data: txRows }, { data: savRows }] = await Promise.all([
      supabase
        .from("budget_transactions")
        .select("amount, category, account, description, date")
        .gte("date", monthStart)
        .lt("date", nextMonth)
        .order("date", { ascending: false }),
      supabase
        .from("budget_monthly_savings")
        .select("account, amount")
        .eq("month", thisMonth),
    ]);

    const txs: any[] = txRows ?? [];
    const savings: any[] = savRows ?? [];

    const today = ymdInTZ(new Date(), TZ);
    const totalIncome = txs.filter((t) => t.amount > 0).reduce((s, t) => s + Number(t.amount), 0);
    const totalExpenses = txs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const cashNetFlow = txs
      .filter((t) => !(t.account in CREDIT_CARDS))
      .reduce((s, t) => s + Number(t.amount), 0);
    const totalSavings = savings
      .filter((s: any) => !(s.account in CREDIT_CARDS))
      .reduce((s: number, r: any) => s + Number(r.amount), 0);

    // By category (expenses only, top 5)
    const catMap: Record<string, number> = {};
    for (const t of txs.filter((t) => t.amount < 0)) {
      catMap[t.category] = (catMap[t.category] ?? 0) + Math.abs(Number(t.amount));
    }
    const topCats = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, amt]) => `  @${cat}: $${amt.toFixed(2)}`);

    const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const msgLines = [
      `Cashflow — ${thisMonth}:`,
      ``,
      `Savings:   ${fmt(totalSavings)}`,
      `Income:    ${fmt(totalIncome)}`,
      `Expenses:  ${fmt(totalExpenses)}`,
      `Cash net:  ${cashNetFlow >= 0 ? "+" : ""}${fmt(cashNetFlow)}`,
    ];

    const debitSavings = savings.filter((s: any) => !(s.account in CREDIT_CARDS));
    if (debitSavings.length > 0) {
      msgLines.push(``, `Accounts:`);
      for (const s of debitSavings) {
        const accTxs = txs.filter((t: any) => t.account === s.account);
        const accNet = accTxs.reduce((sum: number, t: any) => sum + Number(t.amount), 0);
        msgLines.push(`  ${s.account}: ${fmt(Number(s.amount) + accNet)} (${accNet >= 0 ? "+" : ""}${fmt(accNet)})`);
      }
    }

    // Credit card utilization
    const ccLines: string[] = [];
    for (const [account, { limit, cutDay }] of Object.entries(CREDIT_CARDS)) {
      const spent = txs
        .filter((t: any) => t.account === account && Number(t.amount) < 0)
        .reduce((s: number, t: any) => s + Math.abs(Number(t.amount)), 0);
      const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
      const { date: cutDate, daysAway } = nextCutInfo(cutDay, today);
      const cutFmt = new Date(cutDate + "T12:00:00").toLocaleString("en-US", { month: "short", day: "numeric" });
      ccLines.push(`  ${account}: ${fmt(spent)}/${fmt(limit)} (${pct}%) — cuts ${cutFmt} (${daysAway}d)`);
    }
    if (ccLines.length > 0) {
      msgLines.push(``, `Credit cards:`);
      msgLines.push(...ccLines);
    }

    if (topCats.length > 0) {
      msgLines.push(``, `Top expenses:`);
      msgLines.push(...topCats);
    }

    msgLines.push(``, `(${txs.length} transactions this month)`);
    await tgSendMessage(chatId, msgLines.join("\n"), { reply_markup: smartKeyboard() });
    return true;
  }

  return false;
}

/* ──────────────────────────────────────────────────────────────
   Habit log parser: "HT: 1-YES, 2-NO, 3-YES" or "HT: 1 3 5"
   ────────────────────────────────────────────────────────────── */

async function handleHabitLog(
  chatId: string | number,
  text: string,
  supabase: any,
  chatIdStr: string,
  userId: string | null
): Promise<boolean> {
  const match = text.match(/^HT:\s*(.+)$/i);
  if (!match) return false;

  const body = match[1].trim();
  const today = ymdInTZ(new Date(), TZ);

  const { data: habits } = await supabase
    .from("habit_definitions")
    .select("id, name, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  const activeHabits: any[] = habits ?? [];
  if (!activeHabits.length) {
    await tgSendMessage(chatId, "No active habits configured. Use /addhabit <name>.");
    return true;
  }

  const results: Record<string, boolean> = {};

  // Check for "1-YES, 2-NO" format
  const fullPairs = body.match(/\d+-(?:YES|NO|Y|N)/gi);
  if (fullPairs && fullPairs.length > 0) {
    for (const pair of fullPairs) {
      const m = pair.match(/^(\d+)-?(YES|NO|Y|N)$/i);
      if (!m) continue;
      const idx = parseInt(m[1]) - 1;
      if (idx >= 0 && idx < activeHabits.length) {
        results[activeHabits[idx].id] = /^(YES|Y)$/i.test(m[2]);
      }
    }
    // Fill unmentioned habits as NO
    for (const h of activeHabits) {
      if (!(h.id in results)) results[h.id] = false;
    }
  } else {
    // Shorthand: "1 3 5" → those indices are YES, rest NO
    const nums = body.match(/\d+/g)?.map(Number) ?? [];
    const yesSet = new Set(nums);
    for (let i = 0; i < activeHabits.length; i++) {
      results[activeHabits[i].id] = yesSet.has(i + 1);
    }
  }

  if (!Object.keys(results).length) {
    await tgSendMessage(chatId, "Couldn't parse habit response. Try: HT: 1-YES, 2-NO, 3-YES");
    return true;
  }

  // Build raw text
  const resultLines = activeHabits.map((h: any, i: number) =>
    `${i + 1}. ${h.name}: ${results[h.id] ? "YES" : "NO"}`
  );
  const raw = `Habits ${today}:\n${resultLines.join("\n")}`;
  const parsed: Record<string, any> = { date: today, results, telegram_chat_id: chatIdStr };
  if (userId) parsed.telegram_user_id = userId;

  // Upsert
  const { data: existing } = await supabase
    .from("lines")
    .select("id, parsed")
    .eq("bucket", "habits")
    .order("created_at", { ascending: false })
    .limit(10);

  const existingForDate = (existing ?? []).find((r: any) => r.parsed?.date === today);

  if (existingForDate) {
    await supabase.from("lines").update({ raw, parsed }).eq("id", existingForDate.id);
  } else {
    await supabase.from("lines").insert({ bucket: "habits", raw, source: "telegram", parsed });
  }

  const doneCount = activeHabits.filter((h: any) => results[h.id]).length;
  const confirmLines = activeHabits.map((h: any, i: number) =>
    `${results[h.id] ? "✓" : "✗"} ${i + 1}. ${h.name}`
  );
  await tgSendMessage(chatId,
    `Habits logged ✅ (${doneCount}/${activeHabits.length}):\n${confirmLines.join("\n")}`,
    { reply_markup: smartKeyboard() }
  );
  return true;
}

/* ──────────────────────────────────────────────────────────────
   Mood log parser: "MD: 4" or "Mood: 3"
   ────────────────────────────────────────────────────────────── */

async function handleMoodLog(
  chatId: string | number,
  text: string,
  supabase: any,
  chatIdStr: string,
  userId: string | null
): Promise<boolean> {
  const match = text.match(/^(?:MD|Mood):\s*([1-5])\s*(.*)$/i);
  if (!match) return false;

  const score = parseInt(match[1]);
  const notes = match[2].trim();
  const today = ymdInTZ(new Date(), TZ);

  const raw = notes ? `Mood ${today}: ${score}/5 — ${notes}` : `Mood ${today}: ${score}/5`;
  const parsed: Record<string, any> = { date: today, score, telegram_chat_id: chatIdStr };
  if (notes) parsed.notes = notes;
  if (userId) parsed.telegram_user_id = userId;

  // Upsert
  const { data: existing } = await supabase
    .from("lines")
    .select("id, parsed")
    .eq("bucket", "mood")
    .order("created_at", { ascending: false })
    .limit(10);

  const existingForDate = (existing ?? []).find((r: any) => r.parsed?.date === today);

  if (existingForDate) {
    await supabase.from("lines").update({ raw, parsed }).eq("id", existingForDate.id);
  } else {
    await supabase.from("lines").insert({ bucket: "mood", raw, source: "telegram", parsed });
  }

  const MOOD_LABELS: Record<number, string> = { 1: "Terrible", 2: "Bad", 3: "OK", 4: "Good", 5: "Great" };
  const label = MOOD_LABELS[score] ?? "";
  const stars = "⭐".repeat(score);
  const msg = `Mood logged ✅ — ${score}/5 ${label} ${stars}${notes ? `\nNote: ${notes}` : ""}`;
  await tgSendMessage(chatId, msg, { reply_markup: smartKeyboard() });
  return true;
}

/* ──────────────────────────────────────────────────────────────
   Budget log parser: "BM: +$16000 @earnings Rent #ScotiabankDebit"
                      "BM: -$300 @food Groceries #NUDebit"
   ────────────────────────────────────────────────────────────── */

async function handleBudgetLog(
  chatId: string | number,
  text: string,
  supabase: any,
  chatIdStr: string
): Promise<boolean> {
  // Match: BM: [+-]$amount rest
  const match = text.match(/^BM:\s*([+-])?\$?([\d,]+(?:\.\d{1,2})?)\s*(.*)/i);
  if (!match) return false;

  const sign = match[1] === "-" ? -1 : 1;
  const amount = sign * parseFloat(match[2].replace(/,/g, ""));
  const rest = match[3].trim();

  if (isNaN(amount) || amount === 0) {
    await tgSendMessage(chatId, "Invalid amount. Example: BM: -$300 @food Groceries #NUDebit");
    return true;
  }

  const categoryMatch = rest.match(/@([a-zA-Z0-9_-]+)/);
  const accountMatch = rest.match(/#([a-zA-Z0-9_-]+)/);
  const category = categoryMatch?.[1]?.toLowerCase() ?? "general";
  const rawAccount = accountMatch?.[1] ?? "";
  const account = normalizeAccount(rawAccount);
  const description = rest
    .replace(/@[a-zA-Z0-9_-]+/, "")
    .replace(/#[a-zA-Z0-9_-]+/, "")
    .trim();

  if (!account) {
    const msg2 = rawAccount
      ? `Unknown account "${rawAccount}". Valid: ${VALID_ACCOUNTS.join(", ")}`
      : `Account required. Use #AccountName (e.g. #AMEX, #NUDebit, #ScotiabankDebit)`;
    await tgSendMessage(chatId, msg2);
    return true;
  }

  const today = ymdInTZ(new Date(), TZ);
  const sign_str = amount > 0 ? "+" : "-";
  const raw = `BM: ${sign_str}$${Math.abs(amount).toFixed(2)} @${category}${description ? " " + description : ""} #${account}`;

  const row: Record<string, any> = {
    date: today,
    amount,
    category,
    description,
    account,
    source: "telegram",
    raw,
    telegram_chat_id: chatIdStr,
  };

  const { error } = await supabase.from("budget_transactions").insert(row);
  if (error) {
    await tgSendMessage(chatId, `Error saving transaction: ${error.message}`);
    return true;
  }

  const typeLabel = amount > 0 ? "Income" : "Expense";
  const amtLabel = `$${Math.abs(amount).toFixed(2)}`;
  await tgSendMessage(
    chatId,
    `${typeLabel} logged ✅\n${amtLabel} @${category}${description ? " — " + description : ""}\nAccount: ${account}`,
    { reply_markup: smartKeyboard() }
  );
  return true;
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

    const userId = msg?.from?.id?.toString?.() ?? null;
    const chatIdStr = chatId?.toString?.() ?? null;

    // Register chat for reliable notification delivery (fire-and-forget)
    if (chatIdStr) {
      supabase.from("telegram_chats")
        .upsert({ chat_id: chatIdStr }, { onConflict: "chat_id" })
        .then(() => {});
    }

    // Commands
    if (text.trim().startsWith("/")) {
      const handled = await handleCommand(chatId, text, supabase);
      return json(res, 200, { ok: true, command: handled });
    }

    // Habit log pattern: "HT: 1-YES, 2-NO, 3-YES"  or  "HT: 1 3 5"
    if (/^HT:/i.test(text.trim())) {
      const handled = await handleHabitLog(chatId, text.trim(), supabase, chatIdStr!, userId);
      if (handled) return json(res, 200, { ok: true, habit_log: true });
    }

    // Mood log pattern: "MD: 4"  or  "Mood: 3 great day"
    if (/^(?:MD|Mood):/i.test(text.trim())) {
      const handled = await handleMoodLog(chatId, text.trim(), supabase, chatIdStr!, userId);
      if (handled) return json(res, 200, { ok: true, mood_log: true });
    }

    // Budget log pattern: "BM: +$16000 @earnings Rent #ScotiabankDebit"
    if (/^BM:/i.test(text.trim())) {
      const handled = await handleBudgetLog(chatId, text.trim(), supabase, chatIdStr!);
      if (handled) return json(res, 200, { ok: true, budget_log: true });
    }

    const lines = splitIntoLines(text);

    const counts: Record<Bucket, number> = {
      inbox: 0,
      tasks: 0,
      notes: 0,
      links: 0,
      journal: 0,
      archive: 0,
      habits: 0,
      mood: 0,
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
