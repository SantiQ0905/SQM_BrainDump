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

function ymInTZ(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

// GET /api/budget/savings?month=YYYY-MM  →  savings for that month
// POST /api/budget/savings               →  upsert savings for an account

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
      const month = (req.query?.month as string) || ymInTZ(new Date(), TZ);

      const { data, error } = await supabase
        .from("budget_monthly_savings")
        .select("*")
        .eq("month", month)
        .order("account", { ascending: true });

      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { month, savings: data ?? [] });
    }

    if (req.method === "POST") {
      const body = req.body ?? {};
      const month = (body.month as string) || ymInTZ(new Date(), TZ);
      const account = String(body.account ?? "").trim();
      const amount = Number(body.amount);

      if (!account) return json(res, 400, { error: "account required" });
      if (isNaN(amount)) return json(res, 400, { error: "amount must be a number" });

      const { data, error } = await supabase
        .from("budget_monthly_savings")
        .upsert({ month, account, amount }, { onConflict: "month,account" })
        .select()
        .single();

      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { ok: true, saving: data });
    }

    res.statusCode = 405;
    res.setHeader("allow", "GET, POST");
    return res.end();
  } catch (e: any) {
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
