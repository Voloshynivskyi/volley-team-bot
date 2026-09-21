import { Bot, InlineKeyboard, type Context } from "grammy";
import { eq } from "drizzle-orm";
import { db, getSettings, schema } from "@/db";
import type { RsvpStatus } from "@/db/schema";
import { env } from "@/lib/env";
import { linkPlayerByTelegram, listEvents, listPlayers, loadEventBundle, nextScheduledEvent, setRsvp } from "@/lib/events";
import { rsvpLabel } from "@/lib/positions";
import { miniAppLink } from "./api";
import { invalidateAdminCache } from "./admins";
import { buildEventText, esc, rosterText, rsvpKeyboard, scheduleLine } from "./messages";
import { refreshEventPosts } from "./post";

export const bot = new Bot(env.BOT_TOKEN);

const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

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

async function openAppKeyboard(ctx: Context, label = "Відкрити застосунок"): Promise<InlineKeyboard | undefined> {
  // web_app-кнопки дозволені тільки в приватних чатах; у групі даємо deep link.
  if (ctx.chat?.type === "private" && env.APP_URL) return new InlineKeyboard().webApp(label, env.APP_URL);
  const link = await miniAppLink();
  return link ? new InlineKeyboard().url(label, link) : undefined;
}

bot.command("start", async (ctx) => {
  if (ctx.from) await linkPlayerByTelegram(ctx.from);
  const s = await getSettings();
  const kb = await openAppKeyboard(ctx);
  const intro =
    `<b>${esc(s.teamName)}</b>\n\n` +
    "Тут живуть склад команди й розклад ігор.\n" +
    "Команди: /next — найближча подія, /schedule — розклад, /roster — склад.";
  await ctx.reply(intro, { ...HTML, reply_markup: kb });
});

bot.command("here", async (ctx) => {
  if (ctx.chat.type === "private") {
    await ctx.reply("Цю команду треба надіслати в групі, у тому треді, куди бот має писати анонси.");
    return;
  }
  if (!(await isGroupAdmin(ctx))) {
    await ctx.reply("Прив'язати тред може тільки адміністратор групи.");
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
  await ctx.reply(
    threadId
      ? "Готово. Анонси й нагадування писатиму в цей тред."
      : "Готово. Анонси й нагадування писатиму в цю групу.",
  );
});

bot.command("next", async (ctx) => {
  const e = await nextScheduledEvent();
  if (!e) {
    await ctx.reply("Найближчих подій поки немає.", { reply_markup: await openAppKeyboard(ctx, "Відкрити розклад") });
    return;
  }
  const b = await loadEventBundle(e.id);
  if (!b) return;
  const link = await miniAppLink(`event_${e.id}`);
  await ctx.reply(buildEventText(b), { ...HTML, reply_markup: rsvpKeyboard(e.id, link) });
});

bot.command("schedule", async (ctx) => {
  const [list, s] = await Promise.all([listEvents("upcoming", 10), getSettings()]);
  if (!list.length) {
    await ctx.reply("Розклад порожній.", { reply_markup: await openAppKeyboard(ctx, "Відкрити розклад") });
    return;
  }
  const text = ["<b>Найближчі події</b>", "", ...list.map((e) => scheduleLine(e, e.competition, s.timezone))].join("\n");
  await ctx.reply(text, { ...HTML, reply_markup: await openAppKeyboard(ctx, "Повний розклад") });
});

bot.command("roster", async (ctx) => {
  const [players, s] = await Promise.all([listPlayers(), getSettings()]);
  await ctx.reply(rosterText(players, s.teamName), { ...HTML, reply_markup: await openAppKeyboard(ctx, "Відкрити склад") });
});

bot.callbackQuery(/^rsvp:(\d+):(going|maybe|not_going)$/, async (ctx) => {
  const eventId = Number(ctx.match[1]);
  const status = ctx.match[2] as RsvpStatus;

  const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
  if (!event || event.status !== "scheduled") {
    await ctx.answerCallbackQuery({ text: "Ця подія вже неактуальна." });
    return;
  }

  await setRsvp(eventId, ctx.from, status);
  const posts = await refreshEventPosts(eventId);

  // Повідомлення від /next не записане в posts — оновлюємо його окремо.
  const msgId = ctx.msg?.message_id;
  if (msgId && !posts.some((p) => p.messageId === msgId)) {
    const b = await loadEventBundle(eventId);
    if (b) {
      const link = await miniAppLink(`event_${eventId}`);
      try {
        await ctx.editMessageText(buildEventText(b), { ...HTML, reply_markup: rsvpKeyboard(eventId, link) });
      } catch (err) {
        if (!/message is not modified/i.test(String(err))) throw err;
      }
    }
  }

  const { emoji, label } = rsvpLabel(status);
  await ctx.answerCallbackQuery({ text: `${emoji} Записав: ${label.toLowerCase()}` });
});

bot.on("callback_query:data", (ctx) => ctx.answerCallbackQuery());

bot.catch((err) => {
  console.error("bot error", err.error);
});
