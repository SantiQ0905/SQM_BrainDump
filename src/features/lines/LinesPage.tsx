import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { LineItem } from "../../lib/api";

const META: Record<string, { title: string; subtitle: string; placeholder: string; noun: string }> = {
  inbox: {
    title: "Inbox",
    subtitle: "Dump anything. Sort later.",
    noun: "item",
    placeholder: `Buy coffee beans #coffee\nt: [ ] Pay Nu card ^15-02 !2 #finance\nn: Idea for the robot telemetry @ftc`,
  },
  tasks: {
    title: "Tasks",
    subtitle: "Things to do. [ ] for checkboxes, !1 !2 !3 for priority.",
    noun: "task",
    placeholder: `[ ] Buy groceries ^15-02 #errands\n[ ] Review PR for auth module @work !1`,
  },
  notes: {
    title: "Notes",
    subtitle: "Ideas, observations, quick thoughts.",
    noun: "note",
    placeholder: `ECAM alerts could work for robot telemetry @ftc\nRead "Thinking in Systems" #reading`,
  },
  links: {
    title: "Bookmarks",
    subtitle: "Links worth saving. URLs are auto-extracted.",
    noun: "link",
    placeholder: `https://linear.app/changelog #tools\nGreat thread on system design https://x.com/... #engineering`,
  },
  journal: {
    title: "Journal",
    subtitle: "Daily log. Stream of consciousness.",
    noun: "entry",
    placeholder: `Good morning. Slept 7h. Energy is high.\nStruggled with the deploy pipeline, fixed by pinning node version.`,
  },
  archive: {
    title: "Archive",
    subtitle: "Done and dusted.",
    noun: "item",
    placeholder: `Archived entry`,
  },
};

export function LinesPage({ bucket }: { bucket: string }) {
  const meta = META[bucket] ?? { title: bucket, subtitle: "", placeholder: "", noun: "item" };

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
  }, [bucket]);

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

  const plural = items.length === 1 ? meta.noun : `${meta.noun}s`;

  return (
    <div className="animate-page">
      <div className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">{meta.title}</h1>
          <p className="mt-1 text-sm text-muted">{meta.subtitle}</p>
        </div>
        {!loading && items.length > 0 && (
          <span className="rounded-full bg-[var(--surface-raised)] border border-app px-3 py-1 text-xs font-medium text-secondary">
            {items.length} {plural}
          </span>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="xl:sticky xl:top-0 xl:self-start">
          <div className="rounded-2xl border border-app bg-surface p-5 shadow-sm transition-colors">
            <textarea
              className="w-full resize-none bg-transparent font-mono text-[13px] leading-relaxed text-primary placeholder:text-faint outline-none"
              rows={6}
              placeholder={meta.placeholder}
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
              <div className="text-sm">Nothing here yet</div>
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
                    <div className="font-mono text-[13px] leading-relaxed text-primary">{it.raw}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-faint">
                        {new Date(it.created_at).toLocaleDateString()}
                      </span>
                      {it.parsed?.priority && (
                        <span className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                          it.parsed.priority === 1 ? "bg-red-500/10 text-red-400" :
                          it.parsed.priority === 2 ? "bg-amber-500/10 text-amber-400" :
                          "bg-blue-500/10 text-blue-400"
                        }`}>
                          !{it.parsed.priority}
                        </span>
                      )}
                      {it.parsed?.due && (
                        <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-violet-400">
                          ^{it.parsed.due}
                        </span>
                      )}
                      {it.parsed?.project && (
                        <span className="rounded-md bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-cyan-400">
                          @{it.parsed.project}
                        </span>
                      )}
                      {Array.isArray(it.parsed?.tags) &&
                        it.parsed.tags.map((t) => (
                          <span key={t} className="rounded-md bg-[var(--surface-raised)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-secondary">
                            #{t}
                          </span>
                        ))}
                    </div>
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
