import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { LineItem } from "../../lib/api";

export function BookmarksPage() {
  const bucket = "links";

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

  async function deleteItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    try {
      await api.deleteLine(id);
    } catch {
      await refresh();
    }
  }

  return (
    <div className="animate-page">
      <div className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Bookmarks</h1>
          <p className="mt-1 text-sm text-muted">Links worth saving. URLs are auto-extracted.</p>
        </div>
        {!loading && items.length > 0 && (
          <span className="rounded-full bg-[var(--surface-raised)] border border-app px-3 py-1 text-xs font-medium text-secondary">
            {items.length} {items.length === 1 ? "link" : "links"}
          </span>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="xl:sticky xl:top-0 xl:self-start">
          <div className="rounded-2xl border border-app bg-surface p-5 shadow-sm transition-colors">
            <textarea
              className="w-full resize-none bg-transparent font-mono text-[13px] leading-relaxed text-primary placeholder:text-faint outline-none"
              rows={6}
              placeholder={`https://linear.app/changelog #tools\nhttps://arxiv.org/abs/2301.00001 Interesting paper on LLMs #ai\nGreat thread on system design https://x.com/... #engineering`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addText();
              }}
            />

            <div className="mt-4 flex items-center justify-between border-t border-subtle pt-4">
              <span className="text-[11px] text-faint">Ctrl+Enter · multi-line OK</span>
              <button
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-fg)] shadow-sm transition-all hover:bg-[var(--accent-hover)] active:scale-[0.97] disabled:opacity-40"
                disabled={adding || !draft.trim()}
                onClick={addText}
              >
                {adding ? "Adding…" : "Add"}
              </button>
            </div>

            {error && (
              <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-app bg-surface shadow-sm transition-colors">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <span className="spinner" />
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-faint">
              <div className="mb-2 text-3xl">~</div>
              <div className="text-sm">No bookmarks yet</div>
            </div>
          )}

          {!loading && items.length > 0 && (
            <ul>
              {items.map((it, i) => (
                <li
                  key={it.id}
                  className={`animate-item group flex items-start gap-3 px-5 py-4 transition-colors hover-surface ${
                    i > 0 ? "border-t border-subtle" : ""
                  }`}
                  style={{ animationDelay: `${i * 20}ms` }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[13px] leading-relaxed text-primary">
                      {renderWithLinks(it.raw)}
                    </div>
                    <LineMetadata item={it} />
                  </div>
                  <button
                    onClick={() => deleteItem(it.id)}
                    className="shrink-0 rounded p-1 text-faint opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
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

function renderWithLinks(text: string) {
  const urlRe = /\b(https?:\/\/[^\s)]+)/g;
  const parts = text.split(urlRe);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--accent)] underline decoration-[var(--accent)]/30 underline-offset-2 transition-colors hover:decoration-[var(--accent)]"
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

function LineMetadata({ item }: { item: LineItem }) {
  const parts: { label: string; cls: string }[] = [];

  if (item.parsed?.project) {
    parts.push({ label: `@${item.parsed.project}`, cls: "bg-cyan-500/10 text-cyan-400" });
  }

  if (Array.isArray(item.parsed?.tags)) {
    for (const t of item.parsed.tags) {
      parts.push({ label: `#${t}`, cls: "bg-[var(--surface-raised)] text-secondary" });
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-faint">
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
