import { createClient } from "@supabase/supabase-js";

const TZ = "America/Monterrey";
const FISCAL_START_DAY = 16; // fiscal month runs from the 16th to the 15th of the next calendar month
const VALID_ACCOUNTS = ["AMEX", "NUCredit", "NUDebit", "ScotiabankDebit"];

const CREDIT_CARDS: Record<string, { limit: number; cutDay: number }> = {
  AMEX:     { limit: 10000, cutDay: 4 },
  NUCredit: { limit:  6000, cutDay: 6 },
};

function nextCutInfo(cutDay: number, today: string): { date: string; daysAway: number } {
  const [y, m, d] = today.split("-").map(Number);
  let cy = y, cm = m;
  if (d > cutDay) { cm++; if (cm > 12) { cm = 1; cy++; } }
  const daysAway = Math.round(
    (new Date(cy, cm - 1, cutDay).getTime() - new Date(y, m - 1, d).getTime()) / 86400000
  );
  return { date: `${cy}-${String(cm).padStart(2, "0")}-${String(cutDay).padStart(2, "0")}`, daysAway };
}

function normalizeAccount(raw: string): string | null {
  return VALID_ACCOUNTS.find((a) => a.toLowerCase() === raw.toLowerCase()) ?? null;
}

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

// GET /api/budget?month=YYYY-MM        →  transactions + savings + summary for month
// GET /api/budget?config=1&month=…     →  savings config for setup page
// POST /api/budget                     →  add transaction / set-savings / delete / reset / verify-pin / set-initial

export default async function handler(req: any, res: any) {
  try {
    const adminKey = req.headers["x-admin-key"];
    if (!adminKey || adminKey !== getEnv("ADMIN_KEY")) {
      return json(res, 401, { error: "Unauthorized" });
    }

    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false },
    });

    // ── GET /api/budget?config=1 — setup page initial config ───────
    if (req.method === "GET" && req.query?.config === "1") {
      const month = (req.query?.month as string) || ymInTZ(new Date(), TZ);
      const { data, error } = await supabase
        .from("budget_monthly_savings")
        .select("*")
        .eq("month", month);
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { month, savings: data ?? [] });
    }

    if (req.method === "GET") {
      const month = (req.query?.month as string) || ymInTZ(new Date(), TZ);
      const pad = (n: number) => String(n).padStart(2, "0");
      const [y, m] = month.split("-").map(Number);
      const nm = m === 12 ? 1 : m + 1;
      const ny = m === 12 ? y + 1 : y;
      const monthStart = `${month}-${pad(FISCAL_START_DAY)}`;
      const nextMonth = `${ny}-${pad(nm)}-${pad(FISCAL_START_DAY)}`;

      const [txResult, savingsResult, subsResult] = await Promise.all([
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
        supabase
          .from("budget_subscriptions")
          .select("*")
          .eq("active", true)
          .order("billing_day"),
      ]);

      if (txResult.error) return json(res, 500, { error: txResult.error.message });
      if (savingsResult.error) return json(res, 500, { error: savingsResult.error.message });
      // subscriptions table may not exist yet — degrade gracefully
      const subscriptions: any[] = subsResult.data ?? [];

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

      // Credit card utilization
      const today = ymdInTZ(new Date(), TZ);
      const creditCards = Object.entries(CREDIT_CARDS).map(([account, { limit, cutDay }]) => {
        const spent = transactions
          .filter((t) => t.account === account && Number(t.amount) < 0)
          .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
        const savingEntry = savings.find((s) => s.account === account);
        const initialOwed = savingEntry ? Math.abs(Number(savingEntry.amount)) : 0;
        const totalOwed = initialOwed + spent;
        const { date: nextCutDate, daysAway: daysUntilCut } = nextCutInfo(cutDay, today);
        return { account, limit, cutDay, spent, initialOwed, available: limit - totalOwed, nextCutDate, daysUntilCut };
      });

      // Cash net flow (debit accounts only)
      const cashNetFlow = transactions
        .filter((t) => !(t.account in CREDIT_CARDS))
        .reduce((s, t) => s + Number(t.amount), 0);

      // Total savings (exclude credit card entries — they don't have a starting balance)
      const totalSavings = savings
        .filter((s) => !(s.account in CREDIT_CARDS))
        .reduce((sum, s) => sum + Number(s.amount), 0);

      return json(res, 200, {
        month,
        transactions,
        savings,
        totalSavings,
        creditCards,
        subscriptions,
        summary: { totalIncome, totalExpenses, netFlow, cashNetFlow, byAccount, byCategory },
      });
    }

    if (req.method === "POST") {
      const body = req.body ?? {};

      // ── Verify setup PIN ─────────────────────────────────────────
      if (String(body.action ?? "") === "verify-pin") {
        const pin = String(body.pin ?? "");
        if (pin !== getEnv("BUDGET_SETUP_PIN")) return json(res, 401, { error: "Invalid PIN" });
        return json(res, 200, { ok: true });
      }

      // ── Set initial config (bulk savings for all accounts) ────────
      if (String(body.action ?? "") === "set-initial") {
        const pin = String(body.pin ?? "");
        if (pin !== getEnv("BUDGET_SETUP_PIN")) return json(res, 401, { error: "Invalid PIN" });
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

      // ── Add subscription ─────────────────────────────────────────
      if (String(body.action ?? "") === "add-sub") {
        const name = String(body.name ?? "").trim();
        const amount = Math.abs(Number(body.amount));
        const account = normalizeAccount(String(body.account ?? "").trim());
        const category = String(body.category ?? "bills").toLowerCase();
        const billing_day = parseInt(String(body.billing_day ?? "1"), 10);
        if (!name) return json(res, 400, { error: "name required" });
        if (!amount || isNaN(amount)) return json(res, 400, { error: "amount required" });
        if (!account) return json(res, 400, { error: "invalid account" });
        if (billing_day < 1 || billing_day > 31) return json(res, 400, { error: "billing_day must be 1–31" });
        const { data, error } = await supabase
          .from("budget_subscriptions")
          .insert({ name, amount, account, category, billing_day })
          .select().single();
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, { ok: true, subscription: data });
      }

      // ── Delete subscription ───────────────────────────────────────
      if (String(body.action ?? "") === "delete-sub") {
        const id = String(body.id ?? "");
        if (!id) return json(res, 400, { error: "id required" });
        const { error } = await supabase.from("budget_subscriptions").delete().eq("id", id);
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, { ok: true });
      }

      // ── Reset month (delete all transactions + savings) ──────────
      if (String(body.action ?? "") === "reset") {
        const month = (body.month as string) || ymInTZ(new Date(), TZ);
        const [ry, rm] = month.split("-").map(Number);
        const rnm = rm === 12 ? 1 : rm + 1;
        const rny = rm === 12 ? ry + 1 : ry;
        const monthStart = `${month}-${String(FISCAL_START_DAY).padStart(2, "0")}`;
        const nextMonthStr = `${rny}-${String(rnm).padStart(2, "0")}-${String(FISCAL_START_DAY).padStart(2, "0")}`;
        const [txDel, savDel] = await Promise.all([
          supabase.from("budget_transactions").delete().gte("date", monthStart).lt("date", nextMonthStr),
          supabase.from("budget_monthly_savings").delete().eq("month", month),
        ]);
        if (txDel.error) return json(res, 500, { error: txDel.error.message });
        if (savDel.error) return json(res, 500, { error: savDel.error.message });
        return json(res, 200, { ok: true });
      }

      // ── Delete transaction ────────────────────────────────────────
      if (String(body.action ?? "") === "delete") {
        const id = String(body.id ?? "");
        if (!id) return json(res, 400, { error: "id required" });
        const { error } = await supabase.from("budget_transactions").delete().eq("id", id);
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, { ok: true });
      }

      // ── Set monthly saving (formerly /api/budget/savings POST) ────
      if (String(body.action ?? "") === "set-savings") {
        const month = (body.month as string) || ymInTZ(new Date(), TZ);
        const account = String(body.account ?? "").trim();
        const amount = Number(body.amount);
        if (!account) return json(res, 400, { error: "account required" });
        if (isNaN(amount)) return json(res, 400, { error: "amount must be a number" });
        const { data, error } = await supabase
          .from("budget_monthly_savings")
          .upsert({ month, account, amount }, { onConflict: "month,account" })
          .select().single();
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, { ok: true, saving: data });
      }

      // ── Reconcile balance ─────────────────────────────────────────
      if (String(body.action ?? "") === "reconcile") {
        const account = normalizeAccount(String(body.account ?? "").trim());
        if (!account) return json(res, 400, { error: "invalid account" });
        const actualBalance = Number(body.actualBalance);
        if (isNaN(actualBalance)) return json(res, 400, { error: "actualBalance required" });
        const month = (body.month as string) || ymInTZ(new Date(), TZ);
        const date = (body.date as string) || ymdInTZ(new Date(), TZ);
        const [my, mm] = month.split("-").map(Number);
        const mnm = mm === 12 ? 1 : mm + 1;
        const mny = mm === 12 ? my + 1 : my;
        const monthStart = `${month}-${String(FISCAL_START_DAY).padStart(2, "0")}`;
        const nextMonthStr = `${mny}-${String(mnm).padStart(2, "0")}-${String(FISCAL_START_DAY).padStart(2, "0")}`;

        const [savRes, txRes] = await Promise.all([
          supabase.from("budget_monthly_savings").select("amount").eq("month", month).eq("account", account).maybeSingle(),
          supabase.from("budget_transactions").select("amount").eq("account", account).gte("date", monthStart).lt("date", nextMonthStr),
        ]);
        const startingBalance = savRes.data ? Number(savRes.data.amount) : 0;
        const netFlow = (txRes.data ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0);
        const calculatedBalance = startingBalance + netFlow;
        const delta = Math.round((actualBalance - calculatedBalance) * 100) / 100;

        if (Math.abs(delta) < 0.01) {
          return json(res, 200, { ok: true, delta: 0, message: "Balance already matches" });
        }

        const raw = `Reconcile: ${account} actual=${actualBalance} calculated=${calculatedBalance} delta=${delta}`;
        const { data: inserted, error: insErr } = await supabase
          .from("budget_transactions")
          .insert({ date, amount: delta, category: "adjustment", description: "Balance reconciliation", account, source: "web", raw })
          .select().single();
        if (insErr) return json(res, 500, { error: insErr.message });
        return json(res, 200, { ok: true, delta, transaction: inserted });
      }

      // ── Add transaction ───────────────────────────────────────────
      const amount = Number(body.amount);
      const category = String(body.category ?? "general").toLowerCase().replace(/^@/, "");
      const description = String(body.description ?? "").trim();
      const rawAccount = String(body.account ?? "").trim().replace(/^#/, "");
      const account = normalizeAccount(rawAccount);
      const date = (body.date as string) || ymdInTZ(new Date(), TZ);
      const source = (body.source as string) || "web";
      const telegram_chat_id = body.telegram_chat_id as string | undefined;

      if (isNaN(amount) || amount === 0) {
        return json(res, 400, { error: "amount required and must be non-zero" });
      }
      if (!account) {
        return json(res, 400, {
          error: `unknown account "${rawAccount}". Valid: ${VALID_ACCOUNTS.join(", ")}`,
        });
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
