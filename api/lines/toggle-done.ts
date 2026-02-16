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

function setCheckbox(raw: string, done: boolean) {
  // If has checkbox token, flip it. If not, prepend one.
  if (/\[(x| )\]/i.test(raw)) {
    return raw.replace(/\[(x| )\]/i, done ? "[x]" : "[ ]");
  }
  return (done ? "[x] " : "[ ] ") + raw;
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
    const done = Boolean(body.done);

    if (!id) return json(res, 400, { error: "Missing id" });

    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false },
    });

    const { data: row, error: readErr } = await supabase
      .from("lines")
      .select("id, bucket, raw, parsed")
      .eq("id", id)
      .single();

    if (readErr) return json(res, 500, { error: readErr.message });
    if (!row) return json(res, 404, { error: "Not found" });

    let newRaw = row.raw;
    let newParsed = { ...(row.parsed ?? {}), done };

    if (row.bucket === "tasks") {
      newRaw = setCheckbox(row.raw, done);
    }

    const { error: updErr } = await supabase
      .from("lines")
      .update({ raw: newRaw, parsed: newParsed })
      .eq("id", id);

    if (updErr) return json(res, 500, { error: updErr.message });

    return json(res, 200, { ok: true, id, done, raw: newRaw });
  } catch (e: any) {
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
