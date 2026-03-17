import { createClient } from "@supabase/supabase-js";

const TZ = "America/Monterrey";
const VALID_ACCOUNTS = ["AMEX", "NUCredit", "NUDebit", "ScotiabankDebit"];

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

export default async function handler(req: any, res: any) {
  try {
    const adminKey = req.headers["x-admin-key"];
    if (!adminKey || adminKey !== getEnv("ADMIN_KEY")) {
      return json(res, 401, { error: "Unauthorized" });
    }

    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false },
    });

    // GET: return current month savings for all accounts
    if (req.method === "GET") {
      const month = (req.query?.month as string) || ymInTZ(new Date(), TZ);
      const { data, error } = await supabase
        .from("budget_monthly_savings")
        .select("*")
        .eq("month", month);
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { month, savings: data ?? [] });
    }

    if (req.method === "POST") {
      const body = req.body ?? {};
      const action = String(body.action ?? "");
      const setupPin = getEnv("BUDGET_SETUP_PIN");

      // Verify PIN (used before loading the setup page)
      if (action === "verify-pin") {
        const pin = String(body.pin ?? "");
        if (pin !== setupPin) return json(res, 401, { error: "Invalid PIN" });
        return json(res, 200, { ok: true });
      }

      // Set initial config for all accounts at once
      if (action === "set-initial") {
        const pin = String(body.pin ?? "");
        if (pin !== setupPin) return json(res, 401, { error: "Invalid PIN" });

        const month = (body.month as string) || ymInTZ(new Date(), TZ);
        const balances: Record<string, number> = body.balances ?? {};

        const upserts = Object.entries(balances)
          .filter(([acc]) => VALID_ACCOUNTS.includes(acc))
          .map(([account, amount]) => ({ month, account, amount: Number(amount) }));

        if (upserts.length === 0) return json(res, 400, { error: "No valid accounts provided" });

        const { error } = await supabase
          .from("budget_monthly_savings")
          .upsert(upserts, { onConflict: "month,account" });

        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, { ok: true, month, accounts: upserts.length });
      }

      return json(res, 400, { error: "Unknown action" });
    }

    res.statusCode = 405;
    res.setHeader("allow", "GET, POST");
    return res.end();
  } catch (e: any) {
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
