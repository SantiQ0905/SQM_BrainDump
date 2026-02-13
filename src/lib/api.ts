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
  bucket: "inbox" | "tasks" | "notes" | "links" | "journal" | "archive";
  raw: string;
  source: "web" | "telegram";
  parsed: {
    tags?: string[];
    project?: string | null;
    due?: string | null;
    priority?: number | null;
    done?: boolean | null;
    urls?: string[];
  };
};

export const api = {
  lines: (params?: { bucket?: string; search?: string; tag?: string }) => {
    const q = new URLSearchParams();
    if (params?.bucket) q.set("bucket", params.bucket);
    if (params?.search) q.set("search", params.search);
    if (params?.tag) q.set("tag", params.tag);
    const qs = q.toString() ? `?${q.toString()}` : "";
    return request<{ items: LineItem[] }>(`/api/lines${qs}`);
  },

  appendLines: (text: string, defaultBucket: string = "inbox") => {
    return request<{ inserted: number }>(`/api/lines/append`, {
      method: "POST",
      body: JSON.stringify({ text, defaultBucket }),
    });
  },
};
