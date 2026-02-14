import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import type { LineItem } from "../../lib/api";

export function BookmarksPage() {
  const bucket = "bookmarks";

  const [items, setItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const title = useMemo(() => "Bookmarks", []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.lines({ bucket });
      setItems(res.items ?? []);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addText() {
    if (!draft.trim()) return;
    setAdding(true);
    try {
      await api.appendLines(draft, bucket);
      setDraft("");
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to add");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-neutral-600">
            Type freely. One line = one entry. Same grammar as Telegram.
          </p>
        </div>
      </div>

      {/* Notepad input */}
      <div className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <textarea
          className="h-32 w-full resize-y rounded-xl border border-neutral-200 p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-neutral-200"
          placeholder={`Examples:
Buy coffee beans #coffee
t: [ ] Pay Nu card ^2026-02-15 !2 #finance
n: Idea: ECAM alerts for robot telemetry @ftc #robotics
`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />

        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-neutral-500">
            Tip: paste multiple lines — we’ll split them automatically.
          </div>
          <button
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            disabled={adding || !draft.trim()}
            onClick={addText}
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>

        {error && (
          <div className="mt-3 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>

      {/* List */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        {loading && <div className="text-sm text-neutral-600">Loading…</div>}

        {!loading && items.length === 0 && (
          <div className="text-sm text-neutral-600">Empty. Dump something in 📝</div>
        )}

        {!loading && items.length > 0 && (
          <ul className="divide-y divide-neutral-100">
            {items.map((it) => (
              <li key={it.id} className="py-3">
                <div className="font-mono text-sm text-neutral-900">{it.raw}</div>

                <div className="mt-1 flex flex-wrap gap-2 text-xs text-neutral-500">
                  <span>{new Date(it.created_at).toLocaleString()}</span>
                  {it.parsed?.project && <span>@{it.parsed.project}</span>}
                  {it.parsed?.due && <span>^{it.parsed.due}</span>}
                  {it.parsed?.priority && <span>!{it.parsed.priority}</span>}
                  {Array.isArray(it.parsed?.tags) &&
                    it.parsed.tags.map((t) => <span key={t}>#{t}</span>)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
