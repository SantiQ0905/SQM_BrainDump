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

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Bookmarks</h1>
        <p className="text-[13px] text-neutral-400">
          Links worth saving. URLs are auto-extracted.
        </p>
      </div>

      <div className="mb-5 rounded-xl border border-neutral-200 bg-white p-4">
        <textarea
          className="w-full resize-none rounded-lg border-0 bg-transparent p-0 font-mono text-sm leading-relaxed text-neutral-800 placeholder:text-neutral-300 outline-none"
          rows={4}
          placeholder={`https://linear.app/changelog #tools
https://arxiv.org/abs/2301.00001 Interesting paper on LLMs #ai
Great thread on system design https://x.com/... #engineering`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addText();
          }}
        />

        <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
          <div className="text-[11px] text-neutral-300">
            Ctrl+Enter to add &middot; multi-line OK
          </div>
          <button
            className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-40"
            disabled={adding || !draft.trim()}
            onClick={addText}
          >
            {adding ? "Adding..." : "Add"}
          </button>
        </div>

        {error && (
          <div className="mt-2 text-xs text-red-500">{error}</div>
        )}
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white">
        {loading && (
          <div className="p-4 text-sm text-neutral-400">Loading...</div>
        )}

        {!loading && items.length === 0 && (
          <div className="p-8 text-center text-sm text-neutral-300">
            No bookmarks yet
          </div>
        )}

        {!loading && items.length > 0 && (
          <ul>
            {items.map((it, i) => (
              <li
                key={it.id}
                className={`px-4 py-3 ${i > 0 ? "border-t border-neutral-50" : ""}`}
              >
                <div className="font-mono text-[13px] leading-relaxed text-neutral-800">
                  {renderWithLinks(it.raw)}
                </div>
                <LineMetadata item={it} />
              </li>
            ))}
          </ul>
        )}
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
        className="text-blue-500 underline decoration-blue-200 hover:decoration-blue-400"
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

function LineMetadata({ item }: { item: LineItem }) {
  const parts: { label: string; color: string }[] = [];

  if (item.parsed?.project) {
    parts.push({ label: `@${item.parsed.project}`, color: "text-cyan-500" });
  }

  if (Array.isArray(item.parsed?.tags)) {
    for (const t of item.parsed.tags) {
      parts.push({ label: `#${t}`, color: "text-neutral-400" });
    }
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
      <span className="text-neutral-300">
        {new Date(item.created_at).toLocaleDateString()}
      </span>
      {parts.map((p) => (
        <span key={p.label} className={p.color}>
          {p.label}
        </span>
      ))}
    </div>
  );
}
