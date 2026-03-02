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

// GET /api/budget?month=YYYY-MM  →  transactions + savings + summary for month
// POST /api/budget               →  add a transaction

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
      const monthStart = `${month}-01`;
      // last day: first day of next month minus 1
      const [y, m] = month.split("-").map(Number);
      const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

      const [txResult, savingsResult] = await Promise.all([
        supabase
          .from("budget_transactions")
          .select("*")
          .gte("date", monthStart)
          .lt("date", nextMonth)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("budget_monthly_savings")
          .select("*")
          .eq("month", month),
      ]);

      if (txResult.error) return json(res, 500, { error: txResult.error.message });
      if (savingsResult.error) return json(res, 500, { error: savingsResult.error.message });

      const transactions: any[] = txResult.data ?? [];
      const savings: any[] = savingsResult.data ?? [];

      // Summary
      const totalIncome = transactions
        .filter((t) => t.amount > 0)
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const totalExpenses = transactions
        .filter((t) => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
      const netFlow = totalIncome - totalExpenses;

      // By account
      const byAccount: Record<string, { income: number; expenses: number; net: number }> = {};
      for (const t of transactions) {
        if (!byAccount[t.account]) byAccount[t.account] = { income: 0, expenses: 0, net: 0 };
        const amt = Number(t.amount);
        if (amt > 0) byAccount[t.account].income += amt;
        else byAccount[t.account].expenses += Math.abs(amt);
        byAccount[t.account].net += amt;
      }

      // By category
      const byCategory: Record<string, number> = {};
      for (const t of transactions) {
        if (!byCategory[t.category]) byCategory[t.category] = 0;
        byCategory[t.category] += Number(t.amount);
      }

      // Total savings across accounts
      const totalSavings = savings.reduce((sum, s) => sum + Number(s.amount), 0);

      return json(res, 200, {
        month,
        transactions,
        savings,
        totalSavings,
        summary: { totalIncome, totalExpenses, netFlow, byAccount, byCategory },
      });
    }

    if (req.method === "POST") {
      const body = req.body ?? {};
      const amount = Number(body.amount);
      const category = String(body.category ?? "general").toLowerCase().replace(/^@/, "");
      const description = String(body.description ?? "").trim();
      const account = String(body.account ?? "").trim();
      const date = (body.date as string) || ymdInTZ(new Date(), TZ);
      const source = (body.source as string) || "web";
      const telegram_chat_id = body.telegram_chat_id as string | undefined;

      if (isNaN(amount) || amount === 0) {
        return json(res, 400, { error: "amount required and must be non-zero" });
      }
      if (!account) {
        return json(res, 400, { error: "account required" });
      }

      const sign = amount > 0 ? "+" : "-";
      const raw = `BM: ${sign}$${Math.abs(amount).toFixed(2)} @${category}${description ? " " + description : ""} #${account}`;

      const row: Record<string, any> = { date, amount, category, description, account, source, raw };
      if (telegram_chat_id) row.telegram_chat_id = telegram_chat_id;

      const { data, error } = await supabase
        .from("budget_transactions")
        .insert(row)
        .select()
        .single();

      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { ok: true, transaction: data });
    }

    res.statusCode = 405;
    res.setHeader("allow", "GET, POST");
    return res.end();
  } catch (e: any) {
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
