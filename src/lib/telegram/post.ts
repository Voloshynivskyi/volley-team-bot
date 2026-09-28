import { and, asc, eq, gt, gte, inArray, isNull, lt, lte } from "drizzle-orm";
import { db, getSettings, schema } from "@/db";
import type { Post, PostKind } from "@/db/schema";
import {
  digestTime,
  dueReminders,
  isoWeekKey,
  parseReminderHours,
  resultPromptDue,
  shortageDue,
  unpinDue,
  weekRange,
} from "@/lib/cron-rules";
import { listPlayers, loadEventBundle } from "@/lib/events";
import { dict } from "@/lib/i18n";
import { checkLineup, parseLineupRules } from "@/lib/lineup";
import { hoursUntil } from "@/lib/time";
import { api, miniAppLink } from "./api";
import {
  buildEventText,
  esc,
  lineupFor,
  reminderHeader,
  rsvpKeyboard,
  scheduleLine,
  scoreKeyboard,
  teamLang,
  type EventBundle,
} from "./messages";

export { parseReminderHours };

const { events, posts } = schema;

/** Повідомлення, що показують картку події і перемальовуються при кожній зміні. */
const CARD_KINDS: PostKind[] = ["announce", "reminder", "shortage"];

/** Повідомлення в групі пишуться мовою команди — їх читають усі разом. */
async function renderPost(b: EventBundle, kind: PostKind, offsetHours: number) {
  const lang = teamLang(b.settings);
  const t = dict(lang);
  const header =
    kind === "reminder" ? reminderHeader(t, offsetHours) : kind === "shortage" ? t.botExtra.shortageHeader : undefined;
  // Згадуємо тих, хто мовчить, лише коли це ще допоможе: за добу і в тривозі.
  const mentionSilent = kind === "shortage" || (kind === "reminder" && offsetHours >= 12);
  const text = buildEventText(b, lang, { header, mentionSilent });
  const link = await miniAppLink(`event_${b.event.id}`);
  const reply_markup = b.event.status === "scheduled" ? rsvpKeyboard(lang, b.event.id, link) : undefined;
  return { text, reply_markup };
}

export type SendResult = "sent" | "already_sent" | "no_chat" | "not_found";

/** Відправляє картку події в прив'язаний тред. Ідемпотентно по (подія, вид, зсув). */
export async function sendEventPost(eventId: number, kind: PostKind, offsetHours = 0): Promise<SendResult> {
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
  const [row] = await db
    .insert(posts)
    .values({ eventId, chatId, threadId: threadId ?? null, messageId: msg.message_id, kind, offsetHours })
    .onConflictDoNothing()
    .returning();

  if (kind === "announce" && row) await pinPost(row);
  if (kind === "reminder") await deleteOlderReminders(eventId, offsetHours);
  return "sent";
}

/** Анонс висить закріпленим у треді, поки гра не мине. */
async function pinPost(p: Post) {
  try {
    await api.pinChatMessage(p.chatId, p.messageId, { disable_notification: true });
    await db.update(posts).set({ pinned: true }).where(eq(posts.id, p.id));
  } catch (err) {
    // Нема права закріплювати — не біда, анонс однаково в треді.
    console.warn("pin failed", err);
  }
}

/** Нове нагадування замінює попереднє, щоб тред не засмічувався. */
async function deleteOlderReminders(eventId: number, newerOffset: number) {
  const older = await db.query.posts.findMany({
    where: and(
      eq(posts.eventId, eventId),
      eq(posts.kind, "reminder"),
      gt(posts.offsetHours, newerOffset),
      isNull(posts.deletedAt),
    ),
  });
  for (const p of older) {
    try {
      await api.deleteMessage(p.chatId, p.messageId);
    } catch (err) {
      console.warn("delete old reminder failed", err);
    }
    await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, p.id));
  }
}

/** Перемальовує всі живі картки події (нова явка, зміна часу, скасування, рахунок). */
export async function refreshEventPosts(eventId: number): Promise<Post[]> {
  const b = await loadEventBundle(eventId);
  if (!b) return [];
  const list = await db.query.posts.findMany({
    where: and(eq(posts.eventId, eventId), inArray(posts.kind, CARD_KINDS), isNull(posts.deletedAt)),
  });
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

/**
 * Закріплене повідомлення з кнопкою застосунку. Кнопка меню бота в групах не показується —
 * це єдиний спосіб мати "Розклад" під рукою прямо в треді.
 */
export async function sendAppCard(chatId: number, threadId: number | null): Promise<boolean> {
  const s = await getSettings();
  const t = dict(teamLang(s));
  const link = await miniAppLink();
  if (!link) return false;
  const msg = await api.sendMessage(chatId, t.bot.appCard(esc(s.teamName)), {
    message_thread_id: threadId ?? undefined,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: t.bot.appButton, url: link }]] },
  });
  try {
    await api.pinChatMessage(chatId, msg.message_id, { disable_notification: true });
  } catch (err) {
    console.warn("pin app card failed", err);
  }
  return true;
}

/** "Як зіграли?" з кнопками рахунку — через 2 години після початку гри. */
async function sendResultPrompt(eventId: number): Promise<boolean> {
  const s = await getSettings();
  if (!s.chatId) return false;
  const exists = await db.query.posts.findFirst({ where: and(eq(posts.eventId, eventId), eq(posts.kind, "result")) });
  if (exists) return false;
  const e = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!e) return false;
  const lang = teamLang(s);
  const t = dict(lang);
  const link = await miniAppLink(`event_${eventId}`);
  const msg = await api.sendMessage(
    s.chatId,
    `<b>${esc(t.botExtra.resultPrompt(e.opponent ?? "—"))}</b>\n${esc(t.botExtra.resultPromptHint)}`,
    { message_thread_id: s.threadId ?? undefined, parse_mode: "HTML", reply_markup: scoreKeyboard(lang, eventId, link) },
  );
  await db
    .insert(posts)
    .values({ eventId, chatId: s.chatId, threadId: s.threadId ?? null, messageId: msg.message_id, kind: "result" })
    .onConflictDoNothing();
  return true;
}

async function unpinFinished(now: Date): Promise<number> {
  const pinned = await db.query.posts.findMany({ where: eq(posts.pinned, true), with: { event: true } });
  let n = 0;
  for (const p of pinned) {
    if (p.event.status === "scheduled" && !unpinDue(p.event.startsAt, now)) continue;
    try {
      await api.unpinChatMessage(p.chatId, p.messageId);
    } catch (err) {
      console.warn("unpin failed", err);
    }
    await db.update(posts).set({ pinned: false }).where(eq(posts.id, p.id));
    n++;
  }
  return n;
}

async function sendWeeklyDigest(now: Date): Promise<"sent" | "empty" | "skip"> {
  const s = await getSettings();
  if (!s.chatId || !digestTime(now, s.timezone)) return "skip";
  const week = isoWeekKey(now, s.timezone);
  if (s.lastDigestWeek === week) return "skip";

  const { from, to } = weekRange(now, s.timezone);
  const list = await db.query.events.findMany({
    where: and(gte(events.startsAt, from), lt(events.startsAt, to), eq(events.status, "scheduled")),
    orderBy: [asc(events.startsAt)],
    with: { competition: true, attendance: true },
  });
  await db.update(schema.settings).set({ lastDigestWeek: week }).where(eq(schema.settings.id, 1));
  if (!list.length) return "empty";

  const lang = teamLang(s);
  const t = dict(lang);
  const roster = await listPlayers();
  const rules = parseLineupRules(s.lineupRules);
  const lines = list.map((e) =>
    scheduleLine(lang, e, e.competition, s.timezone, e.type === "game" ? checkLineup(rules, e.attendance, roster) : undefined),
  );
  const link = await miniAppLink();
  await api.sendMessage(s.chatId, [`<b>${t.botExtra.digestTitle}</b>`, "", ...lines].join("\n"), {
    message_thread_id: s.threadId ?? undefined,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: link ? { inline_keyboard: [[{ text: t.bot.openSchedule, url: link }]] } : undefined,
  });
  return "sent";
}

export type CronRun = {
  announced: number[];
  reminded: { eventId: number; hours: number }[];
  alerts: number[];
  resultPrompts: number[];
  unpinned: number;
  mvpClosed: number[];
  digest: string;
  backup: string;
  errors: string[];
  skipped?: string;
};

/**
 * Один прохід крона. Викликається зовні кожні 5–15 хв.
 * Кожен крок ізольований: збій одного не зупиняє решту, а власник отримує сповіщення.
 */
export async function runCron(now = new Date()): Promise<CronRun> {
  // Динамічні імпорти — щоб уникнути циклу post ↔ mvp/backup/notify.
  const { closeDueMvpPolls } = await import("@/lib/mvp");
  const { sendWeeklyBackup } = await import("@/lib/backup");
  const { notifyOwner } = await import("@/lib/notify");

  const s = await getSettings();
  const run: CronRun = {
    announced: [],
    reminded: [],
    alerts: [],
    resultPrompts: [],
    unpinned: 0,
    mvpClosed: [],
    digest: "skip",
    backup: "skip",
    errors: [],
  };
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      run.errors.push(`${name}: ${String(err)}`);
      console.error(`cron ${name} failed`, err);
      await notifyOwner(`cron/${name}`, err);
    }
  };

  // Бекап потрібен навіть без прив'язаної групи.
  await step("backup", async () => {
    run.backup = await sendWeeklyBackup(now);
  });

  if (!s.chatId) return { ...run, skipped: "No group linked. Send /here in the target thread." };

  const hours = parseReminderHours(s.reminderHours);
  const horizonH = Math.max(s.announceDaysBefore * 24, ...hours, 48, 0);

  const upcoming = await db.query.events.findMany({
    where: and(
      eq(events.status, "scheduled"),
      gt(events.startsAt, now),
      lte(events.startsAt, new Date(now.getTime() + horizonH * 3_600_000)),
    ),
  });

  for (const e of upcoming) {
    const left = hoursUntil(e.startsAt, now);
    await step(`event ${e.id}`, async () => {
      if (s.announceDaysBefore > 0 && left <= s.announceDaysBefore * 24) {
        if ((await sendEventPost(e.id, "announce")) === "sent") run.announced.push(e.id);
      }
      for (const h of dueReminders(left, hours)) {
        if ((await sendEventPost(e.id, "reminder", h)) === "sent") run.reminded.push({ eventId: e.id, hours: h });
      }
      if (e.type === "game" && shortageDue(left)) {
        const b = await loadEventBundle(e.id);
        if (b && !lineupFor(b).ok && (await sendEventPost(e.id, "shortage")) === "sent") run.alerts.push(e.id);
      }
    });
  }

  await step("results", async () => {
    const played = await db.query.events.findMany({
      where: and(
        eq(events.status, "scheduled"),
        eq(events.type, "game"),
        lt(events.startsAt, new Date(now.getTime() - 2 * 3_600_000)),
      ),
    });
    for (const e of played) {
      if (resultPromptDue(e.startsAt, now) && (await sendResultPrompt(e.id))) run.resultPrompts.push(e.id);
    }
  });

  await step("unpin", async () => {
    run.unpinned = await unpinFinished(now);
  });
  await step("mvp", async () => {
    run.mvpClosed = await closeDueMvpPolls(now);
  });
  await step("digest", async () => {
    run.digest = await sendWeeklyDigest(now);
  });

  return run;
}
