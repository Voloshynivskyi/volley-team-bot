import { and, eq, gt, lte } from "drizzle-orm";
import { db, getSettings, schema } from "@/db";
import type { Post } from "@/db/schema";
import { loadEventBundle } from "@/lib/events";
import { hoursUntil } from "@/lib/time";
import { api, miniAppLink } from "./api";
import { buildEventText, reminderHeader, rsvpKeyboard, type EventBundle } from "./messages";

const { events, posts } = schema;

export function parseReminderHours(raw: string): number[] {
  return [...new Set(raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0))].sort(
    (a, b) => b - a,
  );
}

function headerFor(kind: Post["kind"], offsetHours: number) {
  return kind === "reminder" ? reminderHeader(offsetHours) : undefined;
}

async function renderPost(b: EventBundle, kind: Post["kind"], offsetHours: number) {
  const text = buildEventText(b, headerFor(kind, offsetHours));
  const link = await miniAppLink(`event_${b.event.id}`);
  const reply_markup = b.event.status === "scheduled" ? rsvpKeyboard(b.event.id, link) : undefined;
  return { text, reply_markup };
}

export type SendResult = "sent" | "already_sent" | "no_chat" | "not_found";

/** Відправляє анонс або нагадування в прив'язаний тред. Ідемпотентно по (подія, вид, зсув). */
export async function sendEventPost(eventId: number, kind: Post["kind"], offsetHours = 0): Promise<SendResult> {
  const b = await loadEventBundle(eventId);
  if (!b) return "not_found";
  const { chatId, threadId } = b.settings;
  if (!chatId) return "no_chat";

  const existing = await db.query.posts.findFirst({
    where: and(eq(posts.eventId, eventId), eq(posts.kind, kind), eq(posts.offsetHours, offsetHours)),
  });
  if (existing) return "already_sent";

  const { text, reply_markup } = await renderPost(b, kind, offsetHours);
  const msg = await api.sendMessage(chatId, text, {
    message_thread_id: threadId ?? undefined,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup,
  });
  await db
    .insert(posts)
    .values({ eventId, chatId, threadId: threadId ?? null, messageId: msg.message_id, kind, offsetHours })
    .onConflictDoNothing();
  return "sent";
}

/** Перемальовує всі вже надіслані повідомлення події (нова явка, зміна часу, скасування). */
export async function refreshEventPosts(eventId: number): Promise<Post[]> {
  const b = await loadEventBundle(eventId);
  if (!b) return [];
  const list = await db.query.posts.findMany({ where: eq(posts.eventId, eventId) });
  await Promise.all(
    list.map(async (p) => {
      const { text, reply_markup } = await renderPost(b, p.kind, p.offsetHours);
      try {
        await api.editMessageText(p.chatId, p.messageId, text, {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
          reply_markup,
        });
      } catch (err) {
        if (!/message is not modified/i.test(String(err))) console.warn("editMessageText failed", err);
      }
    }),
  );
  return list;
}

export type ReminderRun = {
  announced: number[];
  reminded: { eventId: number; hours: number }[];
  skipped?: string;
};

/**
 * Один прохід крона. Викликається зовні кожні 5–15 хв.
 * Нагадування за H годин шлеться, коли до події лишилось (H-1, H] годин —
 * тож подія, створена за 30 хв до початку, не отримає застарілого "за 24 години".
 */
export async function runReminders(now = new Date()): Promise<ReminderRun> {
  const s = await getSettings();
  const result: ReminderRun = { announced: [], reminded: [] };
  if (!s.chatId) return { ...result, skipped: "Група не прив'язана. Надішліть /here у потрібному треді." };

  const hours = parseReminderHours(s.reminderHours);
  const horizonH = Math.max(s.announceDaysBefore * 24, ...hours, 0);
  if (horizonH <= 0) return { ...result, skipped: "Анонси й нагадування вимкнені." };

  const upcoming = await db.query.events.findMany({
    where: and(
      eq(events.status, "scheduled"),
      gt(events.startsAt, now),
      lte(events.startsAt, new Date(now.getTime() + horizonH * 3_600_000)),
    ),
  });

  for (const e of upcoming) {
    const diff = hoursUntil(e.startsAt, now);
    if (s.announceDaysBefore > 0 && diff <= s.announceDaysBefore * 24) {
      if ((await sendEventPost(e.id, "announce")) === "sent") result.announced.push(e.id);
    }
    for (const h of hours) {
      const lower = h <= 1 ? 0 : h - 1;
      if (diff <= h && diff > lower) {
        if ((await sendEventPost(e.id, "reminder", h)) === "sent") result.reminded.push({ eventId: e.id, hours: h });
      }
    }
  }
  return result;
}
