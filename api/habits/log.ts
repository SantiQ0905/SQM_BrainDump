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

function ymInTZ(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

// GET /api/habits/log?days=N  →  returns last N days of habit logs + active habits
// POST /api/habits/log        →  upsert today's habit log

export default async function handler(req: any, res: any) {
  try {
    const adminKey = req.headers["x-admin-key"];
    if (!adminKey || adminKey !== getEnv("ADMIN_KEY")) {
      return json(res, 401, { error: "Unauthorized" });
    }

    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false },
    });

    if (req.method === "GET") {
      const days = Math.min(Number(req.query?.days ?? 30), 90);

      const [habitsResult, logsResult] = await Promise.all([
        supabase
          .from("habit_definitions")
          .select("*")
          .order("sort_order", { ascending: true }),
        supabase
          .from("lines")
          .select("id, created_at, parsed")
          .eq("bucket", "habits")
          .order("created_at", { ascending: false })
          .limit(days),
      ]);

      if (habitsResult.error) return json(res, 500, { error: habitsResult.error.message });
      if (logsResult.error) return json(res, 500, { error: logsResult.error.message });

      return json(res, 200, {
        habits: habitsResult.data ?? [],
        logs: logsResult.data ?? [],
      });
    }

    if (req.method === "POST") {
      const body = req.body ?? {};
      const date = (body.date as string) || ymInTZ(new Date(), TZ);
      const results = (body.results as Record<string, boolean>) ?? {};
      const source = (body.source as string) || "web";
      const telegram_chat_id = body.telegram_chat_id as string | undefined;
      const telegram_user_id = body.telegram_user_id as string | undefined;

      if (!Object.keys(results).length) {
        return json(res, 400, { error: "results required (Record<habitId, boolean>)" });
      }

      // Load habits to build human-readable raw text
      const { data: habits } = await supabase
        .from("habit_definitions")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true });

      const habitList = habits ?? [];
      const resultLines = habitList.map((h: any, i: number) =>
        `${i + 1}. ${h.name}: ${results[h.id] ? "YES" : "NO"}`
      );
      const raw = `Habits (monthly) ${date}:\n${resultLines.join("\n")}`;

      const parsed: Record<string, any> = { date, results };
      if (telegram_chat_id) parsed.telegram_chat_id = telegram_chat_id;
      if (telegram_user_id) parsed.telegram_user_id = telegram_user_id;

      // Check if a log already exists for this date
      const { data: existing } = await supabase
        .from("lines")
        .select("id, parsed")
        .eq("bucket", "habits")
        .order("created_at", { ascending: false })
        .limit(60);

      const existingForDate = (existing ?? []).find((r: any) => r.parsed?.date === date);

      if (existingForDate) {
        const { error } = await supabase
          .from("lines")
          .update({ raw, parsed })
          .eq("id", existingForDate.id);
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, { ok: true, updated: true, date });
      }

      const { error } = await supabase
        .from("lines")
        .insert({ bucket: "habits", raw, source, parsed });
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { ok: true, created: true, date });
    }

    res.statusCode = 405;
    res.setHeader("allow", "GET, POST");
    return res.end();
  } catch (e: any) {
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
