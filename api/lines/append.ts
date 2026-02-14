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

function parseLine(input: string, defaultBucket: Bucket = "inbox") {
  const raw0 = normalizeLine(input);
  if (!raw0) return null;

  const head = raw0.slice(0, 2).toLowerCase();
  const bucket = BUCKET_PREFIX[head] ?? defaultBucket;
  const raw = BUCKET_PREFIX[head] ? normalizeLine(raw0.slice(2)) : raw0;

  const tags = extractAll(/#([a-zA-Z0-9_-]+)/g, raw).map((t) => t.toLowerCase());
  const projects = extractAll(/@([a-zA-Z0-9_-]+)/g, raw).map((p) => p.toLowerCase());
  const due = parseDue(raw);
  const priority = (raw.match(/!(1|2|3)\b/)?.[1] ?? null);
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

/** Accept ^YYYY-MM-DD, ^DD-MM-YYYY, or ^DD-MM (assumes current year). */
function parseDue(raw: string): string | null {
  // ISO: ^2026-02-15
  const iso = raw.match(/\^(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD-MM-YYYY: ^15-02-2026
  const dmy = raw.match(/\^(\d{1,2})-(\d{1,2})-(\d{4})\b/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;

  // DD-MM: ^15-02 (assumes current year)
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

    return json(res, 200, { inserted: rows.length });
  } catch (e: any) {
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
