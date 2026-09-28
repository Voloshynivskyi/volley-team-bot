import { config } from "dotenv";

config({ path: ".env.local" });
import { Api } from "grammy";
import { dict, type Lang } from "../src/lib/i18n";

/**
 * Реєструє вебхук і список команд бота трьома мовами.
 *   npm run bot:webhook                    — вебхук на APP_URL/api/telegram + команди
 *   npm run bot:webhook -- --commands-only — лише оновити меню команд
 *   npm run bot:webhook -- --delete        — зняти вебхук
 */
async function setCommands(api: Api) {
  const commands = (lang: Lang) => {
    const c = dict(lang).commands;
    return [
      { command: "next", description: c.next },
      { command: "schedule", description: c.schedule },
      { command: "roster", description: c.roster },
      { command: "here", description: c.here },
      { command: "app", description: c.app },
      { command: "start", description: c.start },
    ];
  };
  // Без language_code — для всіх, чия мова Telegram не uk/ru/en.
  await api.setMyCommands(commands("uk"));
  for (const lang of ["uk", "ru", "en"] as const) {
    await api.setMyCommands(commands(lang), { language_code: lang });
  }
}

async function main() {
  const token = process.env.BOT_TOKEN;
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const secret = process.env.WEBHOOK_SECRET;
  if (!token) throw new Error("BOT_TOKEN is not set");
  const api = new Api(token);

  if (process.argv.includes("--delete")) {
    await api.deleteWebhook({ drop_pending_updates: true });
    console.log("Webhook removed.");
    return;
  }

  if (!process.argv.includes("--commands-only")) {
    if (!appUrl) throw new Error("APP_URL is not set");
    await api.setWebhook(`${appUrl}/api/telegram`, {
      secret_token: secret || undefined,
      allowed_updates: ["message", "callback_query", "my_chat_member"],
    });
  }
  await setCommands(api);

  // Постійна кнопка біля поля вводу в особистому чаті з ботом — відкриває застосунок.
  if (appUrl) {
    await api.setChatMenuButton({
      menu_button: { type: "web_app", text: dict("uk").tabs.schedule, web_app: { url: appUrl } },
    });
  }

  const info = await api.getWebhookInfo();
  const me = await api.getMe();
  console.log(`@${me.username}: webhook → ${info.url}; commands set for uk/ru/en`);
  if (info.last_error_message) console.log("Last Telegram error:", info.last_error_message);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
