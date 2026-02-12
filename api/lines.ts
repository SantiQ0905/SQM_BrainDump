import { createClient } from "@supabase/supabase-js";

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
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("allow", "GET");
      return res.end();
    }

    const adminKey = req.headers["x-admin-key"];
    if (!adminKey || adminKey !== getEnv("ADMIN_KEY")) {
      return json(res, 401, { error: "Unauthorized" });
    }

    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false },
    });

    const bucket = (req.query?.bucket as string | undefined) ?? "inbox";
    const search = (req.query?.search as string | undefined) ?? "";
    const tag = (req.query?.tag as string | undefined) ?? "";

    let q = supabase
      .from("lines")
      .select("id, created_at, bucket, raw, source, parsed")
      .order("created_at", { ascending: false })
      .limit(300);

    if (bucket) q = q.eq("bucket", bucket);
    if (search.trim()) q = q.ilike("raw", `%${search.trim()}%`);
    if (tag.trim()) q = q.contains("parsed->tags", [tag.trim().toLowerCase()]);

    const { data, error } = await q;

    if (error) return json(res, 500, { error: error.message });

    return json(res, 200, { items: data ?? [] });
  } catch (e: any) {
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
