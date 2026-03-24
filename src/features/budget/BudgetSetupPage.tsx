import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, ACCOUNTS } from "../../lib/api";

const CREDIT_CARDS = ["AMEX", "NUCredit"] as const;
const DEBIT_ACCOUNTS = ACCOUNTS.filter((a) => !(CREDIT_CARDS as readonly string[]).includes(a));

const SESSION_KEY = "budget_setup_auth";
const SESSION_PIN_KEY = "budget_setup_pin";

const TZ = "America/Monterrey";
const FISCAL_START_DAY = 16;

function todayParts(): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  return {
    y: Number(parts.find((p) => p.type === "year")?.value ?? "1970"),
    m: Number(parts.find((p) => p.type === "month")?.value ?? "1"),
    d: Number(parts.find((p) => p.type === "day")?.value ?? "1"),
  };
}

function thisMonthYM(): string {
  const { y, m, d } = todayParts();
  if (d < FISCAL_START_DAY) {
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return `${py}-${String(pm).padStart(2, "0")}`;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function fiscalMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  const start = new Date(y, m - 1, FISCAL_START_DAY);
  const end   = new Date(ny, nm - 1, FISCAL_START_DAY - 1);
  const startStr = start.toLocaleString("en-US", { month: "short", day: "numeric" });
  const endStr   = end.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startStr} – ${endStr}`;
}

function todayLabel(): string {
  const { y, m, d } = todayParts();
  return new Date(y, m - 1, d).toLocaleString("en-US", { month: "short", day: "numeric" });
}

function fmtAmt(n: number): string {
  return `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Mode = "fresh" | "midmonth";

export function BudgetSetupPage() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);

  const month = thisMonthYM();
  const { d: dayOfMonth } = todayParts();
  const daysSinceStart = dayOfMonth >= FISCAL_START_DAY ? dayOfMonth - FISCAL_START_DAY : 0;

  const [mode, setMode] = useState<Mode>(daysSinceStart > 2 ? "midmonth" : "fresh");

  const emptyBalances = () =>
    Object.fromEntries([...DEBIT_ACCOUNTS, ...CREDIT_CARDS].map((a) => [a, ""]));

  // anchorBalances = balance as of the 16th (used in both modes for debit; ignored for CC in midmonth)
  const [anchorBalances, setAnchorBalances] = useState<Record<string, string>>(emptyBalances);
  // currentBalances = balance right now (only used in mid-month mode)
  const [currentBalances, setCurrentBalances] = useState<Record<string, string>>(emptyBalances);

  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<{ accounts: string[]; reconciled: string[] } | null>(null);

  async function verifyPin() {
    if (!pin) return;
    setPinLoading(true);
    setPinError(null);
    try {
      await api.verifySetupPin(pin);
      sessionStorage.setItem(SESSION_KEY, "1");
      sessionStorage.setItem(SESSION_PIN_KEY, pin);
      setUnlocked(true);
    } catch {
      setPinError("Incorrect PIN");
    } finally {
      setPinLoading(false);
    }
  }

  useEffect(() => {
    if (!unlocked) return;
    setLoadingConfig(true);
    api.budgetConfig(month).then((d) => {
      const updated = emptyBalances();
      for (const s of d.savings) {
        if (s.account in updated) updated[s.account] = String(s.amount);
      }
      setAnchorBalances(updated);
    }).finally(() => setLoadingConfig(false));
  }, [unlocked]); // eslint-disable-line

  async function saveConfig() {
    const storedPin = sessionStorage.getItem(SESSION_PIN_KEY) ?? "";
    setSaving(true);
    setSaveError(null);
    setSaveResult(null);

    try {
      const numsToSave: Record<string, number> = {};
      const reconcileJobs: Array<{ account: string; current: number }> = [];

      if (mode === "fresh") {
        for (const [acc, val] of Object.entries(anchorBalances)) {
          if (val !== "") {
            const n = parseFloat(val.replace(/,/g, ""));
            if (!isNaN(n)) numsToSave[acc] = n;
          }
        }
      } else {
        // Mid-month: debit accounts have two fields
        for (const acc of DEBIT_ACCOUNTS) {
          const anchor  = anchorBalances[acc]  !== "" ? parseFloat(anchorBalances[acc].replace(/,/g, ""))  : NaN;
          const current = currentBalances[acc] !== "" ? parseFloat(currentBalances[acc].replace(/,/g, "")) : NaN;

          if (!isNaN(anchor) && !isNaN(current)) {
            numsToSave[acc] = anchor;                          // save 16th as anchor
            reconcileJobs.push({ account: acc, current });     // reconcile to today
          } else if (!isNaN(current)) {
            numsToSave[acc] = current;                         // only today → start from today
          } else if (!isNaN(anchor)) {
            numsToSave[acc] = anchor;                          // only 16th → save it
          }
        }

        // Credit cards: current owed becomes the new starting baseline
        for (const acc of CREDIT_CARDS) {
          const current = currentBalances[acc] !== "" ? parseFloat(currentBalances[acc].replace(/,/g, "")) : NaN;
          const anchor  = anchorBalances[acc]  !== "" ? parseFloat(anchorBalances[acc].replace(/,/g, ""))  : NaN;
          if (!isNaN(current)) numsToSave[acc] = current;
          else if (!isNaN(anchor)) numsToSave[acc] = anchor;
        }
      }

      if (Object.keys(numsToSave).length > 0) {
        await api.setBudgetConfig(storedPin, month, numsToSave);
      }

      const reconciledAccounts: string[] = [];
      for (const { account, current } of reconcileJobs) {
        const r = await api.reconcileBalance(account, current, undefined, month);
        if (r.delta !== 0) reconciledAccounts.push(`${account} (${r.delta > 0 ? "+" : ""}${fmtAmt(r.delta)})`);
      }

      setSaveResult({ accounts: Object.keys(numsToSave), reconciled: reconciledAccounts });
    } catch (e: any) {
      setSaveError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // ── PIN gate ──────────────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <div className="animate-page flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-sm rounded-2xl border border-app bg-surface p-8 shadow-sm">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-primary">Budget Setup</h1>
            <p className="mt-1 text-sm text-muted">Enter your setup PIN to access initial configuration.</p>
          </div>
          <input
            type="password"
            className="w-full rounded-lg border border-app bg-[var(--surface-raised)] px-3 py-2.5 text-sm text-primary outline-none placeholder:text-faint focus:border-[var(--accent)]/50 mb-3"
            placeholder="Setup PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && verifyPin()}
            autoFocus
          />
          {pinError && <p className="mb-3 text-xs text-red-400">{pinError}</p>}
          <button
            onClick={verifyPin}
            disabled={pinLoading || !pin}
            className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
          >
            {pinLoading ? "Verifying…" : "Unlock"}
          </button>
          <button
            onClick={() => navigate("/budget")}
            className="mt-3 w-full rounded-lg border border-app px-4 py-2.5 text-sm font-medium text-muted transition hover:text-primary"
          >
            Back to Budget
          </button>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div className="animate-page">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Budget Setup</h1>
          <p className="mt-1 text-sm text-muted">
            {fiscalMonthLabel(month)}
          </p>
        </div>
        <button
          onClick={() => navigate("/budget")}
          className="shrink-0 rounded-lg border border-app px-3 py-1.5 text-xs font-medium text-muted transition hover:text-primary hover:bg-[var(--surface-raised)]"
        >
          ← Back
        </button>
      </div>

      {/* Mode toggle */}
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setMode("fresh")}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
            mode === "fresh"
              ? "bg-[var(--accent)] text-[var(--accent-fg)]"
              : "border border-app text-muted hover:text-primary hover:bg-[var(--surface-raised)]"
          }`}
        >
          Fresh Start — on the 16th
        </button>
        <button
          onClick={() => setMode("midmonth")}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
            mode === "midmonth"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : "border border-app text-muted hover:text-primary hover:bg-[var(--surface-raised)]"
          }`}
        >
          Mid-Month Catch-Up — today ({todayLabel()})
        </button>
      </div>

      {loadingConfig ? (
        <div className="flex justify-center py-16"><span className="spinner" /></div>
      ) : (
        <div className="max-w-lg space-y-5">

          {/* ── FRESH MODE explanation ── */}
          {mode === "fresh" && (
            <div className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-5">
              <p className="text-[11px] font-semibold text-[var(--accent)] uppercase tracking-wider mb-2">How it works</p>
              <ol className="space-y-2 text-[12px] text-muted">
                <li><span className="font-semibold text-primary">1. Enter balances as of the 16th</span> — what you had in each account right when the fiscal month started, before any transactions that day.</li>
                <li><span className="font-semibold text-primary">2. Log income as a transaction</span> — got paid on the 16th? Add a <span className="font-mono">+$amount @earnings</span> transaction on /budget dated the 16th.</li>
                <li><span className="font-semibold text-primary">3. Log every expense</span> — all spending adds up on top of the starting balance.</li>
              </ol>
              <p className="mt-3 text-[11px] text-muted">Dashboard shows: Starting + Income − Expenses = current balance.</p>
            </div>
          )}

          {/* ── MID-MONTH MODE explanation ── */}
          {mode === "midmonth" && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
              <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider mb-2">Mid-Month Catch-Up</p>
              <p className="text-[12px] text-muted mb-3">
                You're setting up on day <span className="font-semibold text-primary">{daysSinceStart + FISCAL_START_DAY}</span> of the fiscal month.
                The 16th–today gap ({daysSinceStart} days) can be handled in two ways per account:
              </p>
              <ul className="space-y-2 text-[12px] text-muted">
                <li>
                  <span className="font-semibold text-primary">Both fields filled</span> — saves the 16th balance as the anchor, then auto-creates a single <em>adjustment</em> transaction to bridge the gap to today's real balance. Future transactions log normally on top.
                </li>
                <li>
                  <span className="font-semibold text-primary">Only "right now" filled</span> — treats today as day zero. Tracking starts clean from this moment. The 16th–today period is not represented.
                </li>
              </ul>
              <p className="mt-3 text-[11px] text-muted">
                <span className="font-semibold text-amber-400">Credit cards:</span> enter current amount owed. This becomes your baseline — future charges are tracked on top.
              </p>
            </div>
          )}

          {/* ── DEBIT ACCOUNTS ── */}
          <div className="rounded-2xl border border-app bg-surface p-6 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-primary">Debit Accounts</h2>
            <p className="mb-4 text-[11px] text-muted">
              {mode === "fresh"
                ? "Cash in each account on the 16th — before any transactions that day."
                : "Enter the 16th balance (optional) and/or current balance to set your anchor."}
            </p>

            {mode === "fresh" ? (
              <div className="space-y-3">
                {DEBIT_ACCOUNTS.map((acc) => (
                  <div key={acc} className="flex items-center gap-3">
                    <label className="w-36 text-sm font-medium text-primary shrink-0">{acc}</label>
                    <div className="flex flex-1 items-center gap-1.5">
                      <span className="text-sm text-muted">$</span>
                      <input
                        type="number"
                        step="0.01"
                        className="flex-1 rounded-lg border border-app bg-[var(--surface-raised)] px-3 py-2 text-sm text-primary outline-none placeholder:text-faint focus:border-[var(--accent)]/50"
                        placeholder="0.00"
                        value={anchorBalances[acc]}
                        onChange={(e) => setAnchorBalances({ ...anchorBalances, [acc]: e.target.value })}
                      />
                    </div>
                    {anchorBalances[acc] !== "" && !isNaN(parseFloat(anchorBalances[acc])) && (
                      <span className="shrink-0 text-xs text-sky-400">{fmtAmt(parseFloat(anchorBalances[acc]))}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 mb-1">
                  <span className="text-[10px] font-semibold text-muted uppercase tracking-wider pl-1">Balance on the 16th</span>
                  <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider pl-1">Right now ({todayLabel()})</span>
                </div>
                {DEBIT_ACCOUNTS.map((acc) => {
                  const anchor  = parseFloat(anchorBalances[acc].replace(/,/g, ""));
                  const current = parseFloat(currentBalances[acc].replace(/,/g, ""));
                  const bothFilled = !isNaN(anchor) && !isNaN(current);
                  const delta = bothFilled ? current - anchor : null;
                  return (
                    <div key={acc}>
                      <p className="text-xs font-semibold text-primary mb-1.5">{acc}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-muted">$</span>
                          <input
                            type="number"
                            step="0.01"
                            className="flex-1 rounded-lg border border-app bg-[var(--surface-raised)] px-3 py-2 text-sm text-primary outline-none placeholder:text-faint focus:border-[var(--accent)]/50"
                            placeholder="optional"
                            value={anchorBalances[acc]}
                            onChange={(e) => setAnchorBalances({ ...anchorBalances, [acc]: e.target.value })}
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-muted">$</span>
                          <input
                            type="number"
                            step="0.01"
                            className="flex-1 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-primary outline-none placeholder:text-faint focus:border-amber-500/50"
                            placeholder="optional"
                            value={currentBalances[acc]}
                            onChange={(e) => setCurrentBalances({ ...currentBalances, [acc]: e.target.value })}
                          />
                        </div>
                      </div>
                      {delta !== null && (
                        <p className="mt-1 text-[10px] text-muted pl-1">
                          Adjustment to create:{" "}
                          <span className={delta >= 0 ? "text-emerald-400" : "text-red-400"}>
                            {delta >= 0 ? "+" : ""}{fmtAmt(delta)}
                          </span>
                          {" "}({delta >= 0 ? "net gain" : "net spend"} since the 16th)
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── CREDIT CARDS ── */}
          <div className="rounded-2xl border border-app bg-surface p-6 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-primary">Credit Cards</h2>
            <p className="mb-4 text-[11px] text-muted">
              {mode === "fresh"
                ? "Amount already owed from the previous billing cycle (before new charges this month). Use 0 if you paid in full."
                : "Current amount owed right now (including charges since the 16th). This becomes your new baseline — future charges track on top."}
            </p>
            <div className="space-y-3">
              {CREDIT_CARDS.map((acc) => {
                const field = mode === "fresh" ? anchorBalances[acc] : currentBalances[acc];
                const setField = (v: string) =>
                  mode === "fresh"
                    ? setAnchorBalances({ ...anchorBalances, [acc]: v })
                    : setCurrentBalances({ ...currentBalances, [acc]: v });
                return (
                  <div key={acc} className="flex items-center gap-3">
                    <label className="w-36 text-sm font-medium text-primary shrink-0">{acc}</label>
                    <div className="flex flex-1 items-center gap-1.5">
                      <span className="text-sm text-muted">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm text-primary outline-none placeholder:text-faint ${
                          mode === "midmonth"
                            ? "border-amber-500/30 bg-amber-500/5 focus:border-amber-500/50"
                            : "border-app bg-[var(--surface-raised)] focus:border-[var(--accent)]/50"
                        }`}
                        placeholder="0.00"
                        value={field}
                        onChange={(e) => setField(e.target.value)}
                      />
                    </div>
                    {field !== "" && !isNaN(parseFloat(field)) && (
                      <span className="shrink-0 text-xs text-amber-400">{fmtAmt(parseFloat(field))}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Result / errors */}
          {saveError && <p className="text-sm text-red-400">{saveError}</p>}
          {saveResult && (
            <div className="rounded-xl bg-emerald-500/10 px-4 py-3 space-y-1">
              <p className="text-sm font-semibold text-emerald-400">Configuration saved.</p>
              <p className="text-[11px] text-muted">
                Balances set for: {saveResult.accounts.join(", ")}.
              </p>
              {saveResult.reconciled.length > 0 && (
                <p className="text-[11px] text-muted">
                  Adjustment transactions created: {saveResult.reconciled.join(", ")}.
                </p>
              )}
              <button
                onClick={() => navigate("/budget")}
                className="mt-2 text-xs font-semibold text-emerald-400 underline underline-offset-2"
              >
                Go to Budget →
              </button>
            </div>
          )}

          <button
            onClick={saveConfig}
            disabled={saving}
            className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--accent-fg)] shadow-sm transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
          >
            {saving ? "Saving…" : mode === "midmonth" ? "Save & Reconcile" : "Save Configuration"}
          </button>

          <p className="text-[11px] text-faint text-center">
            You can re-run this setup anytime to update balances for the current fiscal month.
          </p>
        </div>
      )}
    </div>
  );
}
