import { createClient } from "@supabase/supabase-js";

/* ── Parser (inlined to avoid Vercel module-resolution issues) ── */

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
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

const TZ = "America/Monterrey";

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

function normalizeShortcuts(raw: string, bucket: Bucket): string {
  let s = raw;
  const today = ymdInTZ(new Date(), TZ);
  const tomorrow = ymdInTZ(addDays(new Date(), 1), TZ);
  s = s.replace(/\^today\b/gi, `^${today}`);
  s = s.replace(/\^tomorrow\b/gi, `^${tomorrow}`);
  s = s.replace(/!high\b/gi, "!1");
  s = s.replace(/!med\b/gi, "!2");
  s = s.replace(/!low\b/gi, "!3");
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
  let raw = BUCKET_PREFIX[head] ? normalizeLine(raw0.slice(2)) : raw0;

  raw = normalizeShortcuts(raw, bucket);

  const tags = extractAll(/#([a-zA-Z0-9_-]+)/g, raw).map((t) => t.toLowerCase());
  const projects = extractAll(/@(?!\d{2}:\d{2})([a-zA-Z0-9_-]+)/g, raw).map((p) => p.toLowerCase());
  const { due, due_time } = parseDue(raw);
  const priority = (raw.match(/!(1|2|3)\b/)?.[1] ?? null);
  const doneToken = raw.match(/\[(x| )\]/i)?.[1] ?? null;
  const done = doneToken ? doneToken.toLowerCase() === "x" : null;
  const urls = extractAll(/\b(https?:\/\/[^\s)]+)\b/g, raw);

  const parsed = {
    tags,
    project: projects.length ? projects[0] : null,
    projects,
    due,
    due_time: due ? (due_time ?? "09:00") : null,
    priority: priority ? Number(priority) : null,
    done,
    urls,
  };

  return { bucket, raw, parsed };
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

  const iso = raw.match(/\^(\d{4})-(\d{2})-(\d{2})(?:@(\d{2}):(\d{2}))?(?!\d)/);
  if (iso) {
    extractTime(iso, 4);
    return { due: `${iso[1]}-${iso[2]}-${iso[3]}`, due_time };
  }

  const dmy = raw.match(/\^(\d{1,2})-(\d{1,2})-(\d{4})(?:@(\d{2}):(\d{2}))?(?!\d)/);
  if (dmy) {
    extractTime(dmy, 4);
    return { due: `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`, due_time };
  }

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

/* ── Telegram notification helper ── */

async function notifyTelegram(supabase: any, message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const { data } = await supabase.from("lines").select("parsed")
    .eq("source", "telegram").order("created_at", { ascending: false }).limit(500);
  const chatIds = new Set<string>();
  for (const r of data ?? []) {
    const cid = r?.parsed?.telegram_chat_id;
    if (cid) chatIds.add(String(cid));
  }
  for (const cid of chatIds) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: cid, text: message, disable_web_page_preview: true }),
    }).catch(() => {});
  }
}

/* ── Handler ── */

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

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("allow", "POST");
      return res.end();
    }

    const adminKey = req.headers["x-admin-key"];
    if (!adminKey || adminKey !== getEnv("ADMIN_KEY")) {
      return json(res, 401, { error: "Unauthorized" });
    }

    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false },
    });

    const body = req.body ?? {};
    const text = String(body.text ?? "");
    const defaultBucket = (body.defaultBucket as Bucket | undefined) ?? "inbox";
    const source = "web";

    const lines = splitIntoLines(text);
    if (!lines.length) return json(res, 200, { inserted: 0 });

    const rows = lines
      .map((l) => parseLine(l, defaultBucket))
      .filter(Boolean)
      .map((p: any) => ({
        bucket: p.bucket,
        raw: p.raw,
        parsed: p.parsed,
        source,
      }));

    const { error } = await supabase.from("lines").insert(rows);
    if (error) return json(res, 500, { error: error.message });

    // Notify Telegram about web additions
    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.bucket] = (counts[r.bucket] || 0) + 1;
    }
    const parts = Object.entries(counts).map(([b, c]) => `${b}:${c}`);
    const msg = `Web: Added ${rows.length} item${rows.length > 1 ? "s" : ""} (${parts.join(", ")})`;
    notifyTelegram(supabase, msg).catch(() => {});

    return json(res, 200, { inserted: rows.length });
  } catch (e: any) {
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
