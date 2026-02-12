import { createClient } from "@supabase/supabase-js";

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function unauthorized(res: any) {
  res.statusCode = 401;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ error: "Unauthorized" }));
}

export default async function handler(req: any, res: any) {
  try {
    // Only allow GET for MVP
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("allow", "GET");
      return res.end();
    }

    // Admin key gate
    const adminKey = req.headers["x-admin-key"];
    if (!adminKey || adminKey !== getEnv("ADMIN_KEY")) {
      return unauthorized(res);
    }

    const supabase = createClient(
      getEnv("SUPABASE_URL"),
      getEnv("SUPABASE_SECRET_KEY"),
      {
        auth: { persistSession: false },
      }
    );

    const status = (req.query?.status as string | undefined) ?? "inbox";
    const search = (req.query?.search as string | undefined) ?? "";
    const tag = (req.query?.tag as string | undefined) ?? "";

    let q = supabase
      .from("inbox_items")
      .select("id, created_at, text, status, tags")
      .order("created_at", { ascending: false })
      .limit(200);

    if (status) q = q.eq("status", status);
    if (search.trim()) q = q.ilike("text", `%${search.trim()}%`);
    if (tag.trim()) q = q.contains("tags", [tag.trim()]);

    const { data, error } = await q;

    if (error) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ error: error.message }));
    }

    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ items: data ?? [] }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ error: e?.message ?? "Server error" }));
  }
}
