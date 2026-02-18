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

// GET /api/mood?days=N  →  last N mood logs + weekly average
// POST /api/mood        →  upsert today's mood

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

      const { data, error } = await supabase
        .from("lines")
        .select("id, created_at, parsed")
        .eq("bucket", "mood")
        .order("created_at", { ascending: false })
        .limit(days);

      if (error) return json(res, 500, { error: error.message });

      const logs = data ?? [];
      const today = ymdInTZ(new Date(), TZ);
      const todayLog = logs.find((r: any) => r.parsed?.date === today) ?? null;

      // Weekly average (last 7 entries)
      const last7 = logs.slice(0, 7).map((r: any) => r.parsed?.score).filter(Boolean);
      const weeklyAvg = last7.length
        ? Math.round((last7.reduce((a: number, b: number) => a + b, 0) / last7.length) * 10) / 10
        : null;

      return json(res, 200, { logs, todayLog, weeklyAvg });
    }

    if (req.method === "POST") {
      const body = req.body ?? {};
      const date = (body.date as string) || ymdInTZ(new Date(), TZ);
      const score = Number(body.score);
      const notes = String(body.notes ?? "").trim();
      const source = (body.source as string) || "web";
      const telegram_chat_id = body.telegram_chat_id as string | undefined;
      const telegram_user_id = body.telegram_user_id as string | undefined;

      if (!score || score < 1 || score > 5) {
        return json(res, 400, { error: "score must be 1-5" });
      }

      const raw = notes ? `Mood ${date}: ${score}/5 — ${notes}` : `Mood ${date}: ${score}/5`;
      const parsed: Record<string, any> = { date, score };
      if (notes) parsed.notes = notes;
      if (telegram_chat_id) parsed.telegram_chat_id = telegram_chat_id;
      if (telegram_user_id) parsed.telegram_user_id = telegram_user_id;

      // Check if a log already exists for this date
      const { data: existing } = await supabase
        .from("lines")
        .select("id, parsed")
        .eq("bucket", "mood")
        .order("created_at", { ascending: false })
        .limit(60);

      const existingForDate = (existing ?? []).find((r: any) => r.parsed?.date === date);

      if (existingForDate) {
        const { error } = await supabase
          .from("lines")
          .update({ raw, parsed })
          .eq("id", existingForDate.id);
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, { ok: true, updated: true, date, score });
      }

      const { error } = await supabase
        .from("lines")
        .insert({ bucket: "mood", raw, source, parsed });
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { ok: true, created: true, date, score });
    }

    res.statusCode = 405;
    res.setHeader("allow", "GET, POST");
    return res.end();
  } catch (e: any) {
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
