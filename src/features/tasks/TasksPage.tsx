import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { LineItem } from "../../lib/api";

export function TasksPage() {
  const bucket = "tasks";

  const [items, setItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

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

  async function toggleDone(item: LineItem) {
    const newDone = !item.parsed?.done;
    // Optimistic update
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id
          ? {
              ...it,
              raw: it.raw.replace(/\[(x| )\]/i, newDone ? "[x]" : "[ ]"),
              parsed: { ...it.parsed, done: newDone },
            }
          : it
      )
    );
    try {
      await api.toggleDone(item.id, newDone);
    } catch {
      await refresh();
    }
  }

  async function deleteItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    try {
      await api.deleteLine(id);
    } catch {
      await refresh();
    }
  }

  return (
    <div>
      <div className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Tasks
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Things to do. [ ] for checkboxes, !1 !2 !3 for priority.
          </p>
        </div>
        {!loading && items.length > 0 && (
          <span className="rounded-full bg-neutral-200/60 px-3 py-1 text-xs font-medium text-neutral-500">
            {items.length} {items.length === 1 ? "task" : "tasks"}
          </span>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="xl:sticky xl:top-0 xl:self-start">
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm">
            <textarea
              className="w-full resize-none bg-transparent font-mono text-[13px] leading-relaxed text-neutral-800 placeholder:text-neutral-300 outline-none"
              rows={6}
              placeholder={`[ ] Buy groceries ^15-02 #errands
[ ] Review PR for auth module @work !1
[ ] Call dentist ^20-03 !2`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addText();
              }}
            />

            <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-4">
              <span className="text-[11px] text-neutral-300">
                Ctrl+Enter &middot; multi-line OK
              </span>
              <button
                className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-neutral-800 active:scale-[0.97] disabled:opacity-40 disabled:shadow-none"
                disabled={adding || !draft.trim()}
                onClick={addText}
              >
                {adding ? "Adding..." : "Add"}
              </button>
            </div>

            {error && (
              <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200/80 bg-white shadow-sm">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="text-sm text-neutral-300">Loading...</div>
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-300">
              <div className="mb-2 text-3xl">~</div>
              <div className="text-sm">No tasks yet</div>
            </div>
          )}

          {!loading && items.length > 0 && (
            <ul>
              {items.map((it, i) => (
                <li
                  key={it.id}
                  className={`group flex items-start gap-3 px-5 py-4 transition-colors hover:bg-stone-50 ${i > 0 ? "border-t border-neutral-100" : ""}`}
                >
                  <button
                    onClick={() => toggleDone(it)}
                    className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
                      it.parsed?.done
                        ? "border-neutral-400 bg-neutral-400 text-white"
                        : "border-neutral-300 hover:border-neutral-400"
                    }`}
                  >
                    {it.parsed?.done && (
                      <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className={`font-mono text-[13px] leading-relaxed ${
                      it.parsed?.done
                        ? "text-neutral-400 line-through"
                        : "text-neutral-800"
                    }`}>
                      {it.raw}
                    </div>
                    <LineMetadata item={it} />
                  </div>
                  <button
                    onClick={() => deleteItem(it.id)}
                    className="shrink-0 rounded p-1 text-neutral-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-400 group-hover:opacity-100"
                    title="Delete"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M3 3l8 8M11 3l-8 8" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function LineMetadata({ item }: { item: LineItem }) {
  const parts: { label: string; cls: string }[] = [];

  if (item.parsed?.priority) {
    const cls = item.parsed.priority === 1
      ? "bg-red-50 text-red-500"
      : item.parsed.priority === 2
        ? "bg-amber-50 text-amber-600"
        : "bg-blue-50 text-blue-500";
    parts.push({ label: `!${item.parsed.priority}`, cls });
  }

  if (item.parsed?.due) {
    parts.push({ label: `^${item.parsed.due}`, cls: "bg-violet-50 text-violet-500" });
  }

  if (item.parsed?.project) {
    parts.push({ label: `@${item.parsed.project}`, cls: "bg-cyan-50 text-cyan-600" });
  }

  if (Array.isArray(item.parsed?.tags)) {
    for (const t of item.parsed.tags) {
      parts.push({ label: `#${t}`, cls: "bg-neutral-100 text-neutral-500" });
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-neutral-300">
        {new Date(item.created_at).toLocaleDateString()}
      </span>
      {parts.map((p) => (
        <span
          key={p.label}
          className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium ${p.cls}`}
        >
          {p.label}
        </span>
      ))}
    </div>
  );
}
