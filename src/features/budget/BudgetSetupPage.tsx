import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, ACCOUNTS } from "../../lib/api";

const CREDIT_CARDS = ["AMEX", "NUCredit"] as const;
const DEBIT_ACCOUNTS = ACCOUNTS.filter((a) => !(CREDIT_CARDS as readonly string[]).includes(a));

const SESSION_KEY = "budget_setup_auth";
const SESSION_PIN_KEY = "budget_setup_pin";

const TZ = "America/Monterrey";

function thisMonthYM(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

function fmtAmt(n: number): string {
  return `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function BudgetSetupPage() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);

  const month = thisMonthYM();

  const emptyBalances = () =>
    Object.fromEntries([...DEBIT_ACCOUNTS, ...CREDIT_CARDS].map((a) => [a, ""]));

  const [balances, setBalances] = useState<Record<string, string>>(emptyBalances);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
      setBalances(updated);
    }).finally(() => setLoadingConfig(false));
  }, [unlocked]); // eslint-disable-line

  async function saveConfig() {
    const storedPin = sessionStorage.getItem(SESSION_PIN_KEY) ?? "";
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const nums: Record<string, number> = {};
      for (const [acc, val] of Object.entries(balances)) {
        if (val !== "") {
          const n = parseFloat(val.replace(/,/g, ""));
          if (!isNaN(n)) nums[acc] = n;
        }
      }
      await api.setBudgetConfig(storedPin, month, nums);
      setSaveSuccess(true);
    } catch (e: any) {
      setSaveError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

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

  return (
    <div className="animate-page">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Budget Setup</h1>
          <p className="mt-1 text-sm text-muted">
            Initial account balances for {monthLabel(month)}.
          </p>
        </div>
        <button
          onClick={() => navigate("/budget")}
          className="shrink-0 rounded-lg border border-app px-3 py-1.5 text-xs font-medium text-muted transition hover:text-primary hover:bg-[var(--surface-raised)]"
        >
          ← Back
        </button>
      </div>

      {loadingConfig ? (
        <div className="flex justify-center py-16"><span className="spinner" /></div>
      ) : (
        <div className="max-w-lg space-y-5">

          {/* Debit accounts */}
          <div className="rounded-2xl border border-app bg-surface p-6 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-primary">Debit Accounts — Starting Balance</h2>
            <p className="mb-4 text-[11px] text-muted">
              Your current savings in each debit account at the start of {monthLabel(month)}.
            </p>
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
                      value={balances[acc]}
                      onChange={(e) => setBalances({ ...balances, [acc]: e.target.value })}
                    />
                  </div>
                  {balances[acc] !== "" && !isNaN(parseFloat(balances[acc])) && (
                    <span className="shrink-0 text-xs text-sky-400">{fmtAmt(parseFloat(balances[acc]))}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Credit cards */}
          <div className="rounded-2xl border border-app bg-surface p-6 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-primary">Credit Cards — Balance Already Owed</h2>
            <p className="mb-4 text-[11px] text-muted">
              How much you already owe from previous months. Reduces available credit in the dashboard.
            </p>
            <div className="space-y-3">
              {CREDIT_CARDS.map((acc) => (
                <div key={acc} className="flex items-center gap-3">
                  <label className="w-36 text-sm font-medium text-primary shrink-0">{acc}</label>
                  <div className="flex flex-1 items-center gap-1.5">
                    <span className="text-sm text-muted">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="flex-1 rounded-lg border border-app bg-[var(--surface-raised)] px-3 py-2 text-sm text-primary outline-none placeholder:text-faint focus:border-[var(--accent)]/50"
                      placeholder="0.00"
                      value={balances[acc]}
                      onChange={(e) => setBalances({ ...balances, [acc]: e.target.value })}
                    />
                  </div>
                  {balances[acc] !== "" && !isNaN(parseFloat(balances[acc])) && (
                    <span className="shrink-0 text-xs text-amber-400">{fmtAmt(parseFloat(balances[acc]))}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {saveError && <p className="text-sm text-red-400">{saveError}</p>}
          {saveSuccess && (
            <div className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
              Configuration saved. Head back to Budget to see updated balances.
            </div>
          )}

          <button
            onClick={saveConfig}
            disabled={saving}
            className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--accent-fg)] shadow-sm transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save Configuration"}
          </button>

          <p className="text-[11px] text-faint text-center">
            You can re-run this setup anytime if your account balances change.
          </p>
        </div>
      )}
    </div>
  );
}
