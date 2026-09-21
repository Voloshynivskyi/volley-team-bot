import { config } from "dotenv";

config({ path: ".env.local" });
import { Api } from "grammy";

/**
 * Реєструє вебхук і список команд бота.
 *   npm run bot:webhook            — ставить вебхук на APP_URL/api/telegram
 *   npm run bot:webhook -- --delete — знімає вебхук
 */
async function main() {
  const token = process.env.BOT_TOKEN;
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const secret = process.env.WEBHOOK_SECRET;
  if (!token) throw new Error("BOT_TOKEN не задано");
  const api = new Api(token);

  if (process.argv.includes("--delete")) {
    await api.deleteWebhook({ drop_pending_updates: true });
    console.log("Вебхук знято.");
    return;
  }
  if (!appUrl) throw new Error("APP_URL не задано");

  await api.setWebhook(`${appUrl}/api/telegram`, {
    secret_token: secret || undefined,
    allowed_updates: ["message", "callback_query", "my_chat_member"],
    drop_pending_updates: true,
  });
  await api.setMyCommands([
    { command: "next", description: "Найближча гра або тренування" },
    { command: "schedule", description: "Розклад найближчих подій" },
    { command: "roster", description: "Склад команди" },
    { command: "here", description: "Прив'язати цей тред для анонсів (адмін)" },
    { command: "start", description: "Відкрити застосунок" },
  ]);
  const info = await api.getWebhookInfo();
  const me = await api.getMe();
  console.log(`Бот @${me.username}: вебхук → ${info.url}`);
  if (info.last_error_message) console.log("Остання помилка Telegram:", info.last_error_message);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
