export type Bucket = "inbox" | "tasks" | "notes" | "links" | "journal" | "archive";

const BUCKET_PREFIX: Record<string, Bucket> = {
  "i:": "inbox",
  "t:": "tasks",
  "n:": "notes",
  "l:": "links",
  "j:": "journal",
  "a:": "archive",
};

function normalizeLine(s: string) {
  // keep it Notepad-y: trim outer whitespace, collapse CRLF handled elsewhere
  return s.trim();
}

function extractAll(pattern: RegExp, text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

export function parseLine(input: string, defaultBucket: Bucket = "inbox") {
  const raw0 = normalizeLine(input);
  if (!raw0) return null;

  // Bucket routing by prefix (case-insensitive)
  const head = raw0.slice(0, 2).toLowerCase();
  const bucket = BUCKET_PREFIX[head] ?? defaultBucket;
  const raw = BUCKET_PREFIX[head] ? normalizeLine(raw0.slice(2)) : raw0;

  // Derived fields (keep raw as truth)
  const tags = extractAll(/#([a-zA-Z0-9_-]+)/g, raw).map((t) => t.toLowerCase());
  const projects = extractAll(/@([a-zA-Z0-9_-]+)/g, raw).map((p) => p.toLowerCase());
  const due = (raw.match(/\^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null);
  const priority = (raw.match(/!(1|2|3)\b/)?.[1] ?? null);

  // task done/open tokens
  const doneToken = raw.match(/\[(x| )\]/i)?.[1] ?? null;
  const done = doneToken ? doneToken.toLowerCase() === "x" : null;

  // url detection (simple + pragmatic)
  const urls = extractAll(/\b(https?:\/\/[^\s)]+)\b/g, raw);

  const parsed = {
    tags,
    project: projects.length ? projects[0] : null,
    projects,
    due,                  // "YYYY-MM-DD" | null
    priority: priority ? Number(priority) : null, // 1|2|3|null
    done,                 // boolean|null (only meaningful in tasks)
    urls,
  };

  return { bucket, raw, parsed };
}

export function splitIntoLines(text: string): string[] {
  // Telegram may send \n; Windows paste may have \r\n
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}
