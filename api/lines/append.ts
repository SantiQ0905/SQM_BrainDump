import { createClient } from "@supabase/supabase-js";
import { parseLine, splitIntoLines } from "./parser";
import type { Bucket } from "./parser";

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
