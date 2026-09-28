import { Bot, InlineKeyboard, type Context } from "grammy";
import { eq } from "drizzle-orm";
import { db, getSettings, schema } from "@/db";
import type { RsvpStatus } from "@/db/schema";
import { env } from "@/lib/env";
import { linkPlayerByTelegram, listEvents, listPlayers, loadEventBundle, nextScheduledEvent, setRsvp } from "@/lib/events";
import { dict, langFromCode, type Lang } from "@/lib/i18n";
import { RSVP_EMOJI } from "@/lib/positions";
import { actorOf } from "@/lib/audit";
import { voteMvp } from "@/lib/mvp";
import { notifyOwner } from "@/lib/notify";
import { applyResult } from "@/lib/results";
import { miniAppLink } from "./api";
import { invalidateAdminCache, resolveRole } from "./admins";
import { buildEventText, esc, rosterText, rsvpKeyboard, scheduleLine, teamLang } from "./messages";
import { refreshEventPosts, sendAppCard } from "./post";

export const bot = new Bot(env.BOT_TOKEN);

const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

/**
 * У групі бот пише мовою команди (повідомлення бачать усі разом),
 * в особистому чаті — мовою Telegram конкретної людини.
 */
async function chatLang(ctx: Context): Promise<Lang> {
  const team = teamLang(await getSettings());
  return ctx.chat?.type === "private" ? langFromCode(ctx.from?.language_code, team) : team;
}

/** Спливаюча підказка після натискання кнопки — особиста, тож мовою людини. */
async function personalLang(ctx: Context): Promise<Lang> {
  return langFromCode(ctx.from?.language_code, teamLang(await getSettings()));
}

async function isGroupAdmin(ctx: Context): Promise<boolean> {
  if (!ctx.from || !ctx.chat) return false;
  if (env.OWNER_TELEGRAM_ID === ctx.from.id) return true;
  if (ctx.chat.type === "private") return false;
  try {
    const m = await ctx.getChatMember(ctx.from.id);
    return m.status === "creator" || m.status === "administrator";
  } catch {
    return false;
  }
}

async function openAppKeyboard(ctx: Context, label: string): Promise<InlineKeyboard | undefined> {
  // web_app-кнопки дозволені тільки в приватних чатах; у групі даємо deep link.
  if (ctx.chat?.type === "private" && env.APP_URL) return new InlineKeyboard().webApp(label, env.APP_URL);
  const link = await miniAppLink();
  return link ? new InlineKeyboard().url(label, link) : undefined;
}

bot.command("start", async (ctx) => {
  if (ctx.from) await linkPlayerByTelegram(ctx.from);
  const [s, lang] = await Promise.all([getSettings(), chatLang(ctx)]);
  const t = dict(lang);
  await ctx.reply(t.bot.intro(esc(s.teamName)), { ...HTML, reply_markup: await openAppKeyboard(ctx, t.bot.openApp) });
});

bot.command("here", async (ctx) => {
  const t = dict(await chatLang(ctx));
  if (ctx.chat.type === "private") {
    await ctx.reply(t.bot.hereOnlyGroup);
    return;
  }
  if (!(await isGroupAdmin(ctx))) {
    await ctx.reply(t.bot.hereAdminOnly);
    return;
  }
  const threadId = ctx.msg.is_topic_message ? (ctx.msg.message_thread_id ?? null) : null;
  await db
    .insert(schema.settings)
    .values({ id: 1, chatId: ctx.chat.id, threadId, chatTitle: ctx.chat.title ?? null })
    .onConflictDoUpdate({
      target: schema.settings.id,
      set: { chatId: ctx.chat.id, threadId, chatTitle: ctx.chat.title ?? null, updatedAt: new Date() },
    });
  invalidateAdminCache();
  await ctx.reply(threadId ? t.bot.hereDoneThread : t.bot.hereDoneGroup);
  await sendAppCard(ctx.chat.id, threadId);
});

/** Закріпити в поточному треді повідомлення з кнопкою "Відкрити розклад". */
bot.command("app", async (ctx) => {
  const t = dict(await chatLang(ctx));
  if (ctx.chat.type === "private") {
    await ctx.reply(t.bot.intro(esc((await getSettings()).teamName)), {
      ...HTML,
      reply_markup: await openAppKeyboard(ctx, t.bot.openApp),
    });
    return;
  }
  if (!(await isGroupAdmin(ctx))) {
    await ctx.reply(t.bot.appAdminOnly);
    return;
  }
  const threadId = ctx.msg.is_topic_message ? (ctx.msg.message_thread_id ?? null) : null;
  await sendAppCard(ctx.chat.id, threadId);
});

bot.command("next", async (ctx) => {
  const lang = await chatLang(ctx);
  const t = dict(lang);
  const e = await nextScheduledEvent();
  if (!e) {
    await ctx.reply(t.bot.noUpcoming, { reply_markup: await openAppKeyboard(ctx, t.bot.openSchedule) });
    return;
  }
  const b = await loadEventBundle(e.id);
  if (!b) return;
  const link = await miniAppLink(`event_${e.id}`);
  await ctx.reply(buildEventText(b, lang), { ...HTML, reply_markup: rsvpKeyboard(lang, e.id, link) });
});

bot.command("schedule", async (ctx) => {
  const lang = await chatLang(ctx);
  const t = dict(lang);
  const [list, s] = await Promise.all([listEvents("upcoming", 10), getSettings()]);
  if (!list.length) {
    await ctx.reply(t.bot.scheduleEmpty, { reply_markup: await openAppKeyboard(ctx, t.bot.openSchedule) });
    return;
  }
  const text = [`<b>${t.bot.upcomingTitle}</b>`, "", ...list.map((e) => scheduleLine(lang, e, e.competition, s.timezone))].join(
    "\n",
  );
  await ctx.reply(text, { ...HTML, reply_markup: await openAppKeyboard(ctx, t.bot.fullSchedule) });
});

bot.command("roster", async (ctx) => {
  const lang = await chatLang(ctx);
  const [players, s] = await Promise.all([listPlayers(), getSettings()]);
  await ctx.reply(rosterText(lang, players, s.teamName), {
    ...HTML,
    reply_markup: await openAppKeyboard(ctx, dict(lang).bot.openRoster),
  });
});

bot.callbackQuery(/^rsvp:(\d+):(going|maybe|not_going)$/, async (ctx) => {
  const eventId = Number(ctx.match[1]);
  const status = ctx.match[2] as RsvpStatus;
  const t = dict(await personalLang(ctx));

  const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
  if (!event || event.status !== "scheduled") {
    await ctx.answerCallbackQuery({ text: t.bot.eventInactive });
    return;
  }

  await setRsvp(eventId, ctx.from, status);
  const posts = await refreshEventPosts(eventId);

  // Повідомлення від /next не записане в posts — оновлюємо його окремо, мовою того чату.
  const msgId = ctx.msg?.message_id;
  if (msgId && !posts.some((p) => p.messageId === msgId)) {
    const b = await loadEventBundle(eventId);
    if (b) {
      const lang = await chatLang(ctx);
      const link = await miniAppLink(`event_${eventId}`);
      try {
        await ctx.editMessageText(buildEventText(b, lang), { ...HTML, reply_markup: rsvpKeyboard(lang, eventId, link) });
      } catch (err) {
        if (!/message is not modified/i.test(String(err))) throw err;
      }
    }
  }

  await ctx.answerCallbackQuery({ text: `${RSVP_EMOJI[status]} ${t.bot.recorded(t.rsvp[status].toLowerCase())}` });
});

/** Кнопки рахунку під "Як зіграли?" — записати може лише адмін. */
bot.callbackQuery(/^score:(\d+):(\d):(\d)$/, async (ctx) => {
  const t = dict(await personalLang(ctx));
  const [eventId, us, them] = [1, 2, 3].map((i) => Number(ctx.match[i]));
  const { isAdmin } = await resolveRole(ctx.from.id);
  if (!isAdmin) {
    await ctx.answerCallbackQuery({ text: t.botExtra.adminsOnlyScore, show_alert: true });
    return;
  }
  const ok = await applyResult(eventId, us, them, actorOf(ctx.from));
  await ctx.answerCallbackQuery({ text: ok ? t.botExtra.scoreSaved : t.bot.eventInactive });
});

/** Голос за MVP матчу. Змінити голос можна, поки голосування відкрите. */
bot.callbackQuery(/^mvp:(\d+):(\d+)$/, async (ctx) => {
  const t = dict(await personalLang(ctx));
  const r = await voteMvp(Number(ctx.match[1]), ctx.from, Number(ctx.match[2]));
  const text = r.ok
    ? t.botExtra.mvpVoted(r.name)
    : r.reason === "self"
      ? t.botExtra.mvpSelf
      : r.reason === "closed"
        ? t.botExtra.mvpClosed
        : t.bot.eventInactive;
  await ctx.answerCallbackQuery({ text });
});

bot.on("callback_query:data", (ctx) => ctx.answerCallbackQuery());

bot.catch(async (err) => {
  console.error("bot error", err.error);
  await notifyOwner("bot", err.error);
});
