import { createClient } from "@supabase/supabase-js";

const TZ = "America/Monterrey";
const REMINDER_OFFSETS = [60, 30, 15, 5]; // minutes before due
const CRON_WINDOW = 6; // minutes (slightly > 5-min cron interval)

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function json(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function ymdInTZ(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

function getLocalHHMM(tz: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { hour, minute };
}

async function tgSendMessage(token: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  }).catch(() => {});
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("allow", "GET");
      return res.end();
    }

    const secret = req.headers["x-cron-secret"] ?? req.headers["cron_secret"];
    if (!secret || secret !== getEnv("CRON_SECRET")) {
      return json(res, 401, { error: "Unauthorized cron" });
    }

    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false },
    });

    const token = getEnv("TELEGRAM_BOT_TOKEN");
    const today = ymdInTZ(new Date(), TZ);
    const { hour: nowH, minute: nowM } = getLocalHHMM(TZ);
    const nowMinutes = nowH * 60 + nowM;

    // Discover chat IDs
    const { data: chatRows } = await supabase
      .from("lines")
      .select("parsed")
      .eq("source", "telegram")
      .order("created_at", { ascending: false })
      .limit(500);

    const chatIds: string[] = [];
    const seen = new Set<string>();
    for (const r of chatRows ?? []) {
      const cid = r?.parsed?.telegram_chat_id;
      if (cid && !seen.has(String(cid))) {
        seen.add(String(cid));
        chatIds.push(String(cid));
      }
    }

    if (!chatIds.length) {
      return json(res, 200, { ok: true, msg: "No chats", reminders: 0 });
    }

    // Query open tasks due today with a due_time
    const { data: tasks, error: taskErr } = await supabase
      .from("lines")
      .select("id, raw, parsed")
      .eq("bucket", "tasks")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (taskErr) return json(res, 500, { error: taskErr.message });

    const dueTodayWithTime = (tasks ?? []).filter((t: any) => {
      return t?.parsed?.done !== true &&
        t?.parsed?.due === today &&
        t?.parsed?.due_time;
    });

    let remindersSent = 0;

    for (const task of dueTodayWithTime) {
      const [hh, mm] = (task.parsed.due_time as string).split(":").map(Number);
      const dueMinutes = hh * 60 + mm;
      const diff = dueMinutes - nowMinutes;

      for (const offset of REMINDER_OFFSETS) {
        if (diff <= offset && diff > offset - CRON_WINDOW) {
          const type = `reminder_${offset}m`;

          // Check dedup
          const { data: existing } = await supabase
            .from("notifications_sent")
            .select("id")
            .eq("line_id", task.id)
            .eq("type", type)
            .limit(1);

          if (existing && existing.length > 0) continue;

          // Send to all chats
          const preview = (task.raw ?? "").slice(0, 50);
          const label = offset >= 60 ? `${offset / 60}h` : `${offset}m`;
          const msg = `Reminder: '${preview}' due in ${label} (${task.parsed.due_time})`;

          for (const cid of chatIds) {
            await tgSendMessage(token, cid, msg);

            // Record notification
            await supabase.from("notifications_sent").insert({
              line_id: task.id,
              type,
              chat_id: cid,
            });
          }

          remindersSent++;
        }
      }
    }

    // Cleanup: delete notifications older than 7 days
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("notifications_sent").delete().lt("sent_at", cutoff);

    return json(res, 200, {
      ok: true,
      today,
      now: `${String(nowH).padStart(2, "0")}:${String(nowM).padStart(2, "0")}`,
      tasks_checked: dueTodayWithTime.length,
      reminders_sent: remindersSent,
    });
  } catch (e: any) {
    console.error(e);
    return json(res, 500, { error: e?.message ?? "Server error" });
  }
}
