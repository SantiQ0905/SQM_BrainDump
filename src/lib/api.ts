import { getAdminKey } from "./adminKey";

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const adminKey = getAdminKey();
  const headers = new Headers(init?.headers);

  if (adminKey) headers.set("x-admin-key", adminKey);
  headers.set("content-type", "application/json");

  const res = await fetch(path, { ...init, headers });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(text || `Request failed: ${res.status}`, res.status);
  }

  // handle empty responses
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {} as T;

  return (await res.json()) as T;
}

export type LineItem = {
  id: string;
  created_at: string;
  bucket: "inbox" | "tasks" | "notes" | "links" | "journal" | "archive" | "habits" | "mood";
  raw: string;
  source: "web" | "telegram";
  parsed: {
    tags?: string[];
    project?: string | null;
    due?: string | null;
    due_time?: string | null;
    priority?: number | null;
    done?: boolean | null;
    urls?: string[];
    // habit log fields
    date?: string;
    results?: Record<string, boolean>;
    // mood log fields
    score?: number;
    notes?: string;
  };
};

export type HabitDefinition = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  created_at: string;
};

export type HabitLog = {
  id: string;
  created_at: string;
  parsed: {
    date: string;
    results: Record<string, boolean>;
  };
};

export type MoodLog = {
  id: string;
  created_at: string;
  parsed: {
    date: string;
    score: number;
    notes?: string;
  };
};

export type Metrics = {
  today: string;
  habitStreak: number;
  moodStreak: number;
  moodWeeklyAvg: number | null;
  todayHabitsDone: number;
  todayHabitsTotal: number;
  taskCompletionRate: number | null;
  tasksCompleted30d: number;
  tasksTotal30d: number;
  last14: Array<{
    date: string;
    habitsDone: number;
    habitsTotal: number;
    mood: number | null;
    tasksDone: number;
  }>;
};

export type BudgetTransaction = {
  id: string;
  date: string;
  amount: number;
  category: string;
  description: string;
  account: string;
  source: string;
  raw: string;
  created_at: string;
};

export type BudgetSaving = {
  id: string;
  month: string;
  account: string;
  amount: number;
};

export type CreditCardData = {
  account: string;
  limit: number;
  cutDay: number;
  spent: number;
  available: number;
  nextCutDate: string;
  daysUntilCut: number;
};

export type BudgetSummary = {
  totalIncome: number;
  totalExpenses: number;
  netFlow: number;
  cashNetFlow: number;
  byAccount: Record<string, { income: number; expenses: number; net: number }>;
  byCategory: Record<string, number>;
};

export type BudgetData = {
  month: string;
  transactions: BudgetTransaction[];
  savings: BudgetSaving[];
  totalSavings: number;
  creditCards: CreditCardData[];
  summary: BudgetSummary;
};

export const ACCOUNTS = ["AMEX", "NUCredit", "NUDebit", "ScotiabankDebit"] as const;
export type Account = typeof ACCOUNTS[number];

export const api = {
  lines: (params?: { bucket?: string; search?: string; tag?: string }) => {
    const q = new URLSearchParams();
    if (params?.bucket) q.set("bucket", params.bucket);
    if (params?.search) q.set("search", params.search);
    if (params?.tag) q.set("tag", params.tag);
    const qs = q.toString() ? `?${q.toString()}` : "";
    return request<{ items: LineItem[] }>(`/api/lines${qs}`);
  },

  appendLines: (text: string, defaultBucket: string = "inbox", multiline?: boolean) => {
    return request<{ inserted: number }>(`/api/lines/append`, {
      method: "POST",
      body: JSON.stringify({ text, defaultBucket, ...(multiline ? { multiline: true } : {}) }),
    });
  },

    toggleDone: (id: string, done: boolean) => {
    return request<{ ok: boolean; id: string; done: boolean; raw: string }>(`/api/lines/toggle-done`, {
      method: "POST",
      body: JSON.stringify({ id, done }),
    });
  },

  deleteLine: (id: string) => {
    return request<{ ok: true; id: string }>(`/api/lines/delete`, {
      method: "POST",
      body: JSON.stringify({ id }),
    });
  },

  // ── Habits ──────────────────────────────────────────────────────
  habits: () =>
    request<{ habits: HabitDefinition[] }>(`/api/habits`),

  habitAction: (action: "add" | "toggle" | "delete", payload: Record<string, string>) =>
    request<{ habit?: HabitDefinition; ok?: boolean }>(`/api/habits`, {
      method: "POST",
      body: JSON.stringify({ action, ...payload }),
    }),

  habitLog: (params?: { days?: number }) => {
    const q = new URLSearchParams({ logs: "true" });
    if (params?.days) q.set("days", String(params.days));
    return request<{ habits: HabitDefinition[]; logs: HabitLog[] }>(`/api/habits?${q}`);
  },

  logHabits: (date: string, results: Record<string, boolean>) =>
    request<{ ok: boolean; updated?: boolean; created?: boolean; date: string }>(`/api/habits`, {
      method: "POST",
      body: JSON.stringify({ action: "log", date, results }),
    }),

  // ── Mood ────────────────────────────────────────────────────────
  mood: (params?: { days?: number }) => {
    const q = params?.days ? `?days=${params.days}` : "";
    return request<{ logs: MoodLog[]; todayLog: MoodLog | null; weeklyAvg: number | null }>(`/api/mood${q}`);
  },

  logMood: (date: string, score: number, notes?: string) =>
    request<{ ok: boolean; date: string; score: number }>(`/api/mood`, {
      method: "POST",
      body: JSON.stringify({ date, score, notes }),
    }),

  // ── Metrics ─────────────────────────────────────────────────────
  metrics: () =>
    request<Metrics>(`/api/metrics`),

  // ── Budget ──────────────────────────────────────────────────────
  budget: (month?: string) => {
    const q = month ? `?month=${month}` : "";
    return request<BudgetData>(`/api/budget${q}`);
  },

  addTransaction: (tx: {
    amount: number;
    category: string;
    description?: string;
    account: string;
    date?: string;
  }) =>
    request<{ ok: boolean; transaction: BudgetTransaction }>(`/api/budget`, {
      method: "POST",
      body: JSON.stringify(tx),
    }),

  setSaving: (account: string, amount: number, month?: string) =>
    request<{ ok: boolean; saving: BudgetSaving }>(`/api/budget`, {
      method: "POST",
      body: JSON.stringify({ action: "set-savings", account, amount, month }),
    }),

  deleteTransaction: (id: string) =>
    request<{ ok: boolean }>(`/api/budget`, {
      method: "POST",
      body: JSON.stringify({ action: "delete", id }),
    }),
};

