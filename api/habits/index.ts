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
    const adminKey = req.headers["x-admin-key"];
    if (!adminKey || adminKey !== getEnv("ADMIN_KEY")) {
      return json(res, 401, { error: "Unauthorized" });
    }

    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false },
    });

    // GET /api/habits — list all habits
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("habit_definitions")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { habits: data ?? [] });
    }

    // POST /api/habits — manage habits (add / toggle / delete / reorder)
    if (req.method === "POST") {
      const body = req.body ?? {};
      const action = String(body.action ?? "");

      if (action === "add") {
        const name = String(body.name ?? "").trim();
        if (!name) return json(res, 400, { error: "name required" });

        const { data: existing } = await supabase
          .from("habit_definitions")
          .select("sort_order")
          .order("sort_order", { ascending: false })
          .limit(1);

        const maxOrder = (existing?.[0]?.sort_order ?? 0) + 1;

        const { data, error } = await supabase
          .from("habit_definitions")
          .insert({ name, sort_order: maxOrder })
          .select()
          .single();
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, { habit: data });
      }

      if (action === "toggle") {
        const id = String(body.id ?? "");
        if (!id) return json(res, 400, { error: "id required" });

        const { data: current } = await supabase
          .from("habit_definitions")
          .select("active")
          .eq("id", id)
          .single();

        const { data, error } = await supabase
          .from("habit_definitions")
          .update({ active: !(current?.active ?? true) })
          .eq("id", id)
          .select()
          .single();
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, { habit: data });
      }

      if (action === "delete") {
        const id = String(body.id ?? "");
        if (!id) return json(res, 400, { error: "id required" });

        const { error } = await supabase
          .from("habit_definitions")
          .delete()
          .eq("id", id);
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, { ok: true });
      }

      return json(res, 400, { error: "unknown action (add|toggle|delete)" });
    }

    res.statusCode = 405;
    res.setHeader("allow", "GET, POST");
    return res.end();
  } catch (e: any) {
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
