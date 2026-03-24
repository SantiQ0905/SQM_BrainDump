import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ACCOUNTS } from "../../lib/api";
import type { BudgetData, BudgetSubscription } from "../../lib/api";

const CREDIT_CARDS: Record<string, { limit: number; cutDay: number }> = {
  AMEX:     { limit: 10000, cutDay: 4 },
  NUCredit: { limit:  6000, cutDay: 6 },
};
const DEBIT_ACCOUNTS = ACCOUNTS.filter((a) => !(a in CREDIT_CARDS));

const TZ = "America/Monterrey";
const FISCAL_START_DAY = 16; // fiscal month: 16th → 15th of next calendar month

function todayYMD(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function thisMonthYM(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const m = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const d = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  // Before the fiscal start day we're still in the previous fiscal month
  if (d < FISCAL_START_DAY) {
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return `${py}-${String(pm).padStart(2, "0")}`;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function fmtAmt(n: number, always_sign = false): string {
  const sign = n >= 0 ? (always_sign ? "+" : "") : "-";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  const start = new Date(y, m - 1, FISCAL_START_DAY);
  const end   = new Date(ny, nm - 1, FISCAL_START_DAY - 1);
  const startStr = start.toLocaleString("en-US", { month: "short", day: "numeric" });
  const endStr   = end.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startStr} – ${endStr}`;
}

function prevMonthYM(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function nextMonthYM(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const CATEGORY_COLORS: Record<string, string> = {
  earnings: "text-emerald-400",
  salary:   "text-emerald-400",
  income:   "text-emerald-400",
  food:     "text-amber-400",
  health:   "text-rose-400",
  transport:"text-sky-400",
  shopping: "text-violet-400",
  bills:    "text-orange-400",
  general:  "text-secondary",
};

function catColor(cat: string): string {
  return CATEGORY_COLORS[cat.toLowerCase()] ?? "text-secondary";
}

export function BudgetPage() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(thisMonthYM());
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset confirmation state
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Add transaction form
  const [txSign, setTxSign]   = useState<"+" | "-">("-");
  const [txAmt, setTxAmt]     = useState("");
  const [txCat, setTxCat]     = useState("");
  const [txDesc, setTxDesc]   = useState("");
  const [txAcct, setTxAcct]   = useState(ACCOUNTS[0]);
  const [txDate, setTxDate]   = useState(todayYMD());
  const [txSaving, setTxSaving] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  // Monthly savings form
  const [savAcct, setSavAcct]   = useState(DEBIT_ACCOUNTS[0]);
  const [savAmt, setSavAmt]     = useState("");
  const [savSaving, setSavSaving] = useState(false);
  const [savError, setSavError] = useState<string | null>(null);

  // Reconcile form
  const [recAcct, setRecAcct]   = useState<typeof ACCOUNTS[number]>(ACCOUNTS[0]);
  const [recBal, setRecBal]     = useState("");
  const [recSaving, setRecSaving] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [recResult, setRecResult] = useState<string | null>(null);

  // Subscriptions form
  const [subName, setSubName]   = useState("");
  const [subAmt, setSubAmt]     = useState("");
  const [subAcct, setSubAcct]   = useState(ACCOUNTS[0]);
  const [subCat, setSubCat]     = useState("bills");
  const [subDay, setSubDay]     = useState("1");
  const [subSaving, setSubSaving] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  const [subFormOpen, setSubFormOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const d = await api.budget(month);
      setData(d);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [month]); // eslint-disable-line

  async function addTransaction() {
    const amount = parseFloat(txAmt.replace(/,/g, ""));
    if (isNaN(amount) || amount <= 0) { setTxError("Enter a valid amount"); return; }
    if (!txCat.trim()) { setTxError("Category required"); return; }
    setTxSaving(true);
    setTxError(null);
    try {
      await api.addTransaction({
        amount: txSign === "+" ? amount : -amount,
        category: txCat.trim().replace(/^@/, ""),
        description: txDesc.trim(),
        account: txAcct,
        date: txDate,
      });
      setTxAmt(""); setTxCat(""); setTxDesc("");
      await refresh();
    } catch (e: any) {
      setTxError(e?.message || "Failed to save");
    } finally {
      setTxSaving(false);
    }
  }

  async function setSaving() {
    const amount = parseFloat(savAmt.replace(/,/g, ""));
    if (isNaN(amount)) { setSavError("Enter a valid amount"); return; }
    setSavSaving(true);
    setSavError(null);
    try {
      await api.setSaving(savAcct, amount, month);
      setSavAmt("");
      await refresh();
    } catch (e: any) {
      setSavError(e?.message || "Failed to save");
    } finally {
      setSavSaving(false);
    }
  }

  async function resetMonth() {
    setResetting(true);
    setError(null);
    try {
      await api.resetBudget(month);
      setResetConfirm(false);
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Reset failed");
    } finally {
      setResetting(false);
    }
  }

  async function deleteTransaction(id: string) {
    try {
      await api.deleteTransaction(id);
      await refresh();
    } catch {
      // silent — row stays in list on failure
    }
  }

  async function addSubscription() {
    const amount = parseFloat(subAmt.replace(/,/g, ""));
    if (!subName.trim()) { setSubError("Name required"); return; }
    if (isNaN(amount) || amount <= 0) { setSubError("Enter a valid amount"); return; }
    const day = parseInt(subDay, 10);
    if (isNaN(day) || day < 1 || day > 31) { setSubError("Day must be 1–31"); return; }
    setSubSaving(true);
    setSubError(null);
    try {
      await api.addSubscription({ name: subName.trim(), amount, account: subAcct, category: subCat || "bills", billing_day: day });
      setSubName(""); setSubAmt(""); setSubDay("1"); setSubCat("bills");
      setSubFormOpen(false);
      await refresh();
    } catch (e: any) {
      setSubError(e?.message || "Failed to save");
    } finally {
      setSubSaving(false);
    }
  }

  function computeRecDelta(): number | null {
    if (!data || !recBal) return null;
    const actual = parseFloat(recBal.replace(/,/g, ""));
    if (isNaN(actual)) return null;
    const sav = data.savings.find((s) => s.account === recAcct);
    const startBal = sav ? Number(sav.amount) : 0;
    const netFlow = data.transactions.filter((t) => t.account === recAcct).reduce((s, t) => s + Number(t.amount), 0);
    return Math.round((actual - (startBal + netFlow)) * 100) / 100;
  }

  async function reconcileBalance() {
    const actual = parseFloat(recBal.replace(/,/g, ""));
    if (isNaN(actual)) { setRecError("Enter a valid balance"); return; }
    setRecSaving(true);
    setRecError(null);
    setRecResult(null);
    try {
      const r = await api.reconcileBalance(recAcct, actual, undefined, month);
      if (r.delta === 0) {
        setRecResult("Balance already matches — no adjustment needed.");
      } else {
        setRecResult(`Adjustment of ${fmtAmt(r.delta, true)} logged for ${recAcct}.`);
      }
      setRecBal("");
      await refresh();
    } catch (e: any) {
      setRecError(e?.message || "Failed to reconcile");
    } finally {
      setRecSaving(false);
    }
  }

  async function deleteSubscription(id: string) {
    try {
      await api.deleteSubscription(id);
      await refresh();
    } catch {
      // silent
    }
  }

  const summary = data?.summary;
  const savings = data?.savings ?? [];
  const transactions = data?.transactions ?? [];
  const subscriptions: BudgetSubscription[] = data?.subscriptions ?? [];

  // Sort by category for expense breakdown (expenses only)
  const expenseByCategory = Object.entries(summary?.byCategory ?? {})
    .filter(([, v]) => v < 0)
    .map(([cat, v]) => ({ cat, amount: Math.abs(v) }))
    .sort((a, b) => b.amount - a.amount);

  const incomeByCategory = Object.entries(summary?.byCategory ?? {})
    .filter(([, v]) => v > 0)
    .map(([cat, v]) => ({ cat, amount: v }))
    .sort((a, b) => b.amount - a.amount);

  const maxExpense = expenseByCategory[0]?.amount ?? 1;

  // Per-account: savings + net flow (debit accounts only)
  const accountRows = DEBIT_ACCOUNTS.map((acc) => {
    const sav = savings.find((s) => s.account === acc);
    const accTxs = transactions.filter((t) => t.account === acc);
    const net = accTxs.reduce((s, t) => s + Number(t.amount), 0);
    const balance = (sav ? Number(sav.amount) : 0) + net;
    return { acc, savingsAmt: sav ? Number(sav.amount) : null, net, balance };
  }).filter((r) => r.savingsAmt !== null || r.net !== 0);

  return (
    <div className="animate-page">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Budget</h1>
          <p className="mt-1 text-sm text-muted">
            Cashflow tracker — log income and expenses per account.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Month navigator */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMonth(prevMonthYM(month))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-app text-muted transition hover:text-primary hover:bg-[var(--surface-raised)]"
            >‹</button>
            <span className="min-w-[140px] text-center text-sm font-semibold text-primary">
              {monthLabel(month)}
            </span>
            <button
              onClick={() => setMonth(nextMonthYM(month))}
              disabled={month >= thisMonthYM()}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-app text-muted transition hover:text-primary hover:bg-[var(--surface-raised)] disabled:opacity-30"
            >›</button>
          </div>
          {/* Setup link */}
          <button
            onClick={() => navigate("/budget/setup")}
            className="rounded-lg border border-app px-3 py-1.5 text-xs font-medium text-muted transition hover:text-primary hover:bg-[var(--surface-raised)]"
          >
            Setup
          </button>
          {/* Reset button */}
          {!resetConfirm ? (
            <button
              onClick={() => setResetConfirm(true)}
              className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10"
            >
              Reset
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted">Reset {monthLabel(month)}?</span>
              <button
                onClick={resetMonth}
                disabled={resetting}
                className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/30 disabled:opacity-40"
              >
                {resetting ? "…" : "Yes, reset"}
              </button>
              <button
                onClick={() => setResetConfirm(false)}
                className="rounded-lg border border-app px-3 py-1.5 text-xs font-medium text-muted transition hover:text-primary"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* ── Left column ── */}
        <div className="space-y-4">

          {/* Summary cards */}
          {!loading && summary && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Income",   value: summary.totalIncome,    color: "text-emerald-400" },
                { label: "Expenses", value: summary.totalExpenses,  color: "text-red-400" },
                { label: "Cash Net", value: summary.cashNetFlow,    color: summary.cashNetFlow >= 0 ? "text-emerald-400" : "text-red-400", signed: true },
                { label: "Savings",  value: data!.totalSavings,     color: "text-sky-400" },
              ].map(({ label, value, color, signed }) => (
                <div key={label} className="rounded-2xl border border-app bg-surface p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
                  <p className={`mt-1 text-[18px] font-bold ${color}`}>
                    {signed ? fmtAmt(value, true) : fmtAmt(value)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Starting balances */}
          <div className="rounded-2xl border border-app bg-surface p-5 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-primary">Starting Balances</h2>
            <p className="mb-3 text-[11px] text-muted">
              What you had in each account <em>before</em> your first logged transaction this month. Log salary and expenses as transactions below — the balance is calculated automatically.
            </p>
            {savings.length > 0 && (
              <ul className="mb-3 space-y-1.5">
                {savings.map((s) => (
                  <li key={s.id} className="flex items-center justify-between text-[12px]">
                    <span className="text-muted">{s.account}</span>
                    <span className="font-semibold text-sky-400">{fmtAmt(Number(s.amount))}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 mb-2">
              <select
                value={savAcct}
                onChange={(e) => setSavAcct(e.target.value as any)}
                className="rounded-lg border border-app bg-[var(--surface-raised)] px-2 py-2 text-[12px] text-primary outline-none focus:border-[var(--accent)]/50"
              >
                {DEBIT_ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <input
                type="number"
                step="0.01"
                className="flex-1 rounded-lg border border-app bg-[var(--surface-raised)] px-3 py-2 text-[13px] text-primary outline-none placeholder:text-faint focus:border-[var(--accent)]/50"
                placeholder="0.00"
                value={savAmt}
                onChange={(e) => setSavAmt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setSaving()}
              />
              <button
                onClick={setSaving}
                disabled={savSaving || !savAmt}
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
              >
                {savSaving ? "…" : "Set"}
              </button>
            </div>
            {savError && <p className="text-[11px] text-red-400">{savError}</p>}
          </div>

          {/* Balance Reconciliation */}
          <div className="rounded-2xl border border-app bg-surface p-5 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-primary">Reconcile Balance</h2>
            <p className="mb-3 text-[11px] text-muted">
              Enter your actual current balance. The app computes the gap vs. tracked transactions and logs an <em>adjustment</em> entry automatically.
            </p>
            <div className="space-y-2">
              <div className="flex gap-2">
                <select
                  value={recAcct}
                  onChange={(e) => { setRecAcct(e.target.value as any); setRecResult(null); setRecError(null); }}
                  className="rounded-lg border border-app bg-[var(--surface-raised)] px-2 py-2 text-[12px] text-primary outline-none focus:border-[var(--accent)]/50"
                >
                  {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <input
                  type="number"
                  step="0.01"
                  className="flex-1 rounded-lg border border-app bg-[var(--surface-raised)] px-3 py-2 text-[13px] text-primary outline-none placeholder:text-faint focus:border-[var(--accent)]/50"
                  placeholder="Actual balance now"
                  value={recBal}
                  onChange={(e) => { setRecBal(e.target.value); setRecResult(null); }}
                  onKeyDown={(e) => e.key === "Enter" && reconcileBalance()}
                />
              </div>
              {recBal && (() => {
                const delta = computeRecDelta();
                if (delta === null) return null;
                const isZero = Math.abs(delta) < 0.01;
                return (
                  <p className="text-[11px] text-muted">
                    Adjustment:{" "}
                    <span className={isZero ? "text-emerald-400" : delta > 0 ? "text-emerald-400" : "text-red-400"}>
                      {isZero ? "none needed" : fmtAmt(delta, true)}
                    </span>
                  </p>
                );
              })()}
              <button
                onClick={reconcileBalance}
                disabled={recSaving || !recBal}
                className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-fg)] shadow-sm transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
              >
                {recSaving ? "Reconciling…" : "Reconcile"}
              </button>
              {recError && <p className="text-[11px] text-red-400">{recError}</p>}
              {recResult && <p className="text-[11px] text-emerald-400">{recResult}</p>}
            </div>
          </div>

          {/* Credit Cards */}
          {!loading && data && data.creditCards.length > 0 && (
            <div className="rounded-2xl border border-app bg-surface p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-primary">Credit Cards</h2>
              <ul className="space-y-4">
                {data.creditCards.map((cc) => {
                  const totalOwed = cc.spent + (cc.initialOwed ?? 0);
                  const pct = cc.limit > 0 ? Math.round((totalOwed / cc.limit) * 100) : 0;
                  const barColor = pct >= 80 ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-sky-500";
                  const textColor = pct >= 80 ? "text-red-400" : pct >= 60 ? "text-amber-400" : "text-sky-400";
                  const cutLabel = new Date(cc.nextCutDate + "T12:00:00").toLocaleString("en-US", { month: "short", day: "numeric" });
                  return (
                    <li key={cc.account}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-primary">{cc.account}</span>
                        <span className={`text-[11px] font-bold ${textColor}`}>{pct}% used</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]">
                        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted">
                        <span>
                          {cc.initialOwed > 0 && <>{fmtAmt(cc.initialOwed)} prev · </>}
                          {fmtAmt(cc.spent)} this month · {fmtAmt(cc.available)} left of {fmtAmt(cc.limit)}
                        </span>
                        <span>Cut {cutLabel} ({cc.daysUntilCut}d)</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Add transaction */}
          <div className="rounded-2xl border border-app bg-surface p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-primary">Add Transaction</h2>
            <div className="space-y-2">
              {/* Sign + Amount row */}
              <div className="flex gap-2">
                <div className="flex rounded-lg border border-app overflow-hidden">
                  {(["+", "-"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setTxSign(s)}
                      className={`px-3 py-2 text-sm font-bold transition ${
                        txSign === s
                          ? s === "+" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                          : "text-muted hover:text-primary"
                      }`}
                    >{s}</button>
                  ))}
                </div>
                <input
                  type="number"
                  step="0.01"
                  className="flex-1 rounded-lg border border-app bg-[var(--surface-raised)] px-3 py-2 text-[13px] text-primary outline-none placeholder:text-faint focus:border-[var(--accent)]/50"
                  placeholder="Amount"
                  value={txAmt}
                  onChange={(e) => setTxAmt(e.target.value)}
                />
              </div>
              {/* Category */}
              <input
                type="text"
                className="w-full rounded-lg border border-app bg-[var(--surface-raised)] px-3 py-2 text-[13px] text-primary outline-none placeholder:text-faint focus:border-[var(--accent)]/50"
                placeholder="@category (food, health, earnings…)"
                value={txCat}
                onChange={(e) => setTxCat(e.target.value.toLowerCase())}
              />
              {/* Description */}
              <input
                type="text"
                className="w-full rounded-lg border border-app bg-[var(--surface-raised)] px-3 py-2 text-[13px] text-primary outline-none placeholder:text-faint focus:border-[var(--accent)]/50"
                placeholder="Description (optional)"
                value={txDesc}
                onChange={(e) => setTxDesc(e.target.value)}
              />
              {/* Account + Date row */}
              <div className="flex gap-2">
                <select
                  value={txAcct}
                  onChange={(e) => setTxAcct(e.target.value as any)}
                  className="flex-1 rounded-lg border border-app bg-[var(--surface-raised)] px-2 py-2 text-[12px] text-primary outline-none focus:border-[var(--accent)]/50"
                >
                  {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <input
                  type="date"
                  className="rounded-lg border border-app bg-[var(--surface-raised)] px-2 py-2 text-[12px] text-primary outline-none focus:border-[var(--accent)]/50"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                />
              </div>
              <button
                onClick={addTransaction}
                disabled={txSaving || !txAmt || !txCat}
                className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-fg)] shadow-sm transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
              >
                {txSaving ? "Saving…" : `Log ${txSign === "+" ? "Income" : "Expense"}`}
              </button>
              {txError && <p className="text-[11px] text-red-400">{txError}</p>}
            </div>
          </div>

          {/* Account balances */}
          {accountRows.length > 0 && (
            <div className="rounded-2xl border border-app bg-surface p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-primary">Account Balances</h2>
              <ul className="space-y-3">
                {accountRows.map(({ acc, savingsAmt, net, balance }) => (
                  <li key={acc}>
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-medium text-primary">{acc}</span>
                      <span className={`font-bold ${balance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {fmtAmt(balance)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted">
                      {savingsAmt !== null && `Start: ${fmtAmt(savingsAmt)}`}
                      {savingsAmt !== null && net !== 0 && "  ·  "}
                      {net !== 0 && `Flow: ${fmtAmt(net, true)}`}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Right column ── */}
        <div className="space-y-4">

          {/* Expense breakdown */}
          {!loading && expenseByCategory.length > 0 && (
            <div className="rounded-2xl border border-app bg-surface p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-primary">Expenses by Category</h2>
              <ul className="space-y-3">
                {expenseByCategory.map(({ cat, amount }) => {
                  const pct = Math.round((amount / maxExpense) * 100);
                  return (
                    <li key={cat}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className={`text-[12px] font-medium ${catColor(cat)}`}>@{cat}</span>
                        <span className="text-[12px] font-semibold text-red-400">{fmtAmt(amount)}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]">
                        <div
                          className="h-full rounded-full bg-red-500/60 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Income breakdown */}
          {!loading && incomeByCategory.length > 0 && (
            <div className="rounded-2xl border border-app bg-surface p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-primary">Income by Category</h2>
              <ul className="space-y-2">
                {incomeByCategory.map(({ cat, amount }) => (
                  <li key={cat} className="flex items-center justify-between text-[12px]">
                    <span className={`font-medium ${catColor(cat)}`}>@{cat}</span>
                    <span className="font-semibold text-emerald-400">{fmtAmt(amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Subscriptions */}
          <div className="rounded-2xl border border-app bg-surface shadow-sm">
            <div className="border-b border-subtle px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-primary">Subscriptions</h2>
                <p className="text-[10px] text-muted mt-0.5">Known recurring charges — for reference</p>
              </div>
              <button
                onClick={() => setSubFormOpen((v) => !v)}
                className="rounded-lg border border-app px-2.5 py-1 text-[11px] font-medium text-muted transition hover:text-primary hover:bg-[var(--surface-raised)]"
              >
                {subFormOpen ? "Cancel" : "+ Add"}
              </button>
            </div>

            {subFormOpen && (
              <div className="border-b border-subtle px-5 py-4 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 rounded-lg border border-app bg-[var(--surface-raised)] px-3 py-2 text-[12px] text-primary outline-none placeholder:text-faint focus:border-[var(--accent)]/50"
                    placeholder="Name (e.g. Netflix)"
                    value={subName}
                    onChange={(e) => setSubName(e.target.value)}
                  />
                  <input
                    type="number"
                    step="0.01"
                    className="w-24 rounded-lg border border-app bg-[var(--surface-raised)] px-3 py-2 text-[12px] text-primary outline-none placeholder:text-faint focus:border-[var(--accent)]/50"
                    placeholder="Amount"
                    value={subAmt}
                    onChange={(e) => setSubAmt(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <select
                    value={subAcct}
                    onChange={(e) => setSubAcct(e.target.value as any)}
                    className="rounded-lg border border-app bg-[var(--surface-raised)] px-2 py-2 text-[12px] text-primary outline-none focus:border-[var(--accent)]/50"
                  >
                    {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <input
                    type="text"
                    className="rounded-lg border border-app bg-[var(--surface-raised)] px-3 py-2 text-[12px] text-primary outline-none placeholder:text-faint focus:border-[var(--accent)]/50"
                    placeholder="@category"
                    value={subCat}
                    onChange={(e) => setSubCat(e.target.value.replace(/^@/, "").toLowerCase())}
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-muted shrink-0">Day</span>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      className="w-14 rounded-lg border border-app bg-[var(--surface-raised)] px-2 py-2 text-[12px] text-primary outline-none focus:border-[var(--accent)]/50"
                      value={subDay}
                      onChange={(e) => setSubDay(e.target.value)}
                    />
                  </div>
                </div>
                {subError && <p className="text-[11px] text-red-400">{subError}</p>}
                <button
                  onClick={addSubscription}
                  disabled={subSaving || !subName || !subAmt}
                  className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
                >
                  {subSaving ? "Saving…" : "Add Subscription"}
                </button>
              </div>
            )}

            {subscriptions.length === 0 && !subFormOpen ? (
              <div className="px-5 py-8 text-center text-[12px] text-faint">
                No subscriptions yet — click + Add to track recurring charges.
              </div>
            ) : subscriptions.length > 0 ? (
              <ul>
                {subscriptions.map((sub, i) => {
                  const todayDay = parseInt(todayYMD().split("-")[2], 10);
                  const charged = sub.billing_day <= todayDay;
                  return (
                    <li
                      key={sub.id}
                      className={`flex items-center gap-3 px-5 py-3 ${i > 0 ? "border-t border-subtle" : ""}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-medium text-primary">{sub.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            charged
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-amber-500/10 text-amber-400"
                          }`}>
                            {charged ? `charged (day ${sub.billing_day})` : `day ${sub.billing_day}`}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted">
                          <span className={`${catColor(sub.category)}`}>@{sub.category}</span>
                          {" · "}{sub.account}
                        </div>
                      </div>
                      <span className="shrink-0 text-[13px] font-bold text-red-400">
                        -{fmtAmt(Number(sub.amount))}
                      </span>
                      <button
                        onClick={() => deleteSubscription(sub.id)}
                        className="ml-1 shrink-0 rounded p-1 text-faint transition hover:text-red-400"
                        title="Delete"
                      >×</button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {/* Transaction list */}
          <div className="rounded-2xl border border-app bg-surface shadow-sm">
            <div className="border-b border-subtle px-5 py-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-primary">Transactions</h2>
              <span className="text-[11px] text-muted">{transactions.length} total</span>
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <span className="spinner" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-faint">
                <div className="mb-2 text-3xl">$</div>
                <div className="text-sm">No transactions yet</div>
                {savings.length === 0
                  ? <div className="mt-1 text-xs text-muted">Start by setting your starting balance on the left, then log your first transaction.</div>
                  : <div className="mt-1 text-xs text-muted">Use the form on the left or send <span className="font-mono">BM: -$100 @food #NUDebit</span> via Telegram.</div>
                }
              </div>
            ) : (
              <ul>
                {transactions.map((tx, i) => (
                  <li
                    key={tx.id}
                    className={`animate-item flex items-center gap-3 px-5 py-3.5 ${i > 0 ? "border-t border-subtle" : ""}`}
                    style={{ animationDelay: `${i * 10}ms` }}
                  >
                    {/* Sign indicator */}
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
                      Number(tx.amount) > 0
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-red-500/15 text-red-400"
                    }`}>
                      {Number(tx.amount) > 0 ? "+" : "−"}
                    </span>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className={`text-[11px] font-semibold ${catColor(tx.category)}`}>@{tx.category}</span>
                        {tx.description && (
                          <span className="break-words text-[12px] text-primary">{tx.description}</span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
                        <span>{tx.date}</span>
                        <span>·</span>
                        <span>{tx.account}</span>
                        {tx.source === "telegram" && <span>· via TG</span>}
                      </div>
                    </div>
                    {/* Amount */}
                    <span className={`shrink-0 text-[14px] font-bold ${
                      Number(tx.amount) > 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {fmtAmt(Number(tx.amount), true)}
                    </span>
                    {/* Delete */}
                    <button
                      onClick={() => deleteTransaction(tx.id)}
                      className="ml-1 shrink-0 rounded p-1 text-faint transition hover:text-red-400"
                      title="Delete"
                    >×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
