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

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    const id = String(body.id ?? "");

    if (!id) return json(res, 400, { error: "Missing id" });

    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false },
    });

    // Fetch row before deleting for notification content
    const { data: row } = await supabase
      .from("lines")
      .select("id, bucket, raw")
      .eq("id", id)
      .single();

    const { error } = await supabase
      .from("lines")
      .delete()
      .eq("id", id);

    if (error) return json(res, 500, { error: error.message });

    if (row) {
      const preview = (row.raw ?? "").slice(0, 60);
      const msg = `Web: Deleted (${row.bucket}): ${preview}`;
      notifyTelegram(supabase, msg).catch(() => {});
    }

    return json(res, 200, { ok: true, id });
  } catch (e: any) {
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
