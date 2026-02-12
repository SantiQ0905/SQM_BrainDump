import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { InboxItem } from "../../lib/api";

export function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    api
      .inbox({ status: "inbox" })
      .then((res) => {
        if (!alive) return;
        setItems(res.items ?? []);
      })
      .catch((e: any) => {
        if (!alive) return;
        setError(e?.message || "Failed to load inbox");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inbox</h1>
          <p className="text-sm text-neutral-600">
            Telegram drops land here. Later we’ll convert them into tasks/notes.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        {loading && <div className="text-sm text-neutral-600">Loading…</div>}

        {!loading && error && (
          <div className="text-sm">
            <div className="font-medium text-neutral-900">
              Can’t reach the API yet (expected right now).
            </div>
            <div className="mt-1 text-neutral-600">{error}</div>
            <div className="mt-3 text-neutral-500">
              Next steps will add the backend endpoint <code>/api/inbox</code>.
            </div>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="text-sm text-neutral-600">
            Inbox is empty. Once Telegram webhook is wired, messages will appear here.
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <ul className="divide-y divide-neutral-100">
            {items.map((it) => (
              <li key={it.id} className="py-3">
                <div className="text-sm text-neutral-900">{it.text}</div>
                <div className="mt-1 text-xs text-neutral-500">
                  {new Date(it.created_at).toLocaleString()} • {it.status}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
