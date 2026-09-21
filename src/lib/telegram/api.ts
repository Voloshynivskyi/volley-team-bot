import { Api } from "grammy";
import { env } from "@/lib/env";

/**
 * Окремий API-клієнт без Bot: ним користуються cron, REST-роути й перевірка
 * адмінів. Так модулі не залежать від bot.ts і не утворюють циклічних імпортів.
 */
export const api = new Api(env.BOT_TOKEN);

let usernameCache: string | null = null;

export async function getBotUsername(): Promise<string | null> {
  if (usernameCache) return usernameCache;
  try {
    const me = await api.getMe();
    usernameCache = me.username ?? null;
  } catch (err) {
    console.error("getMe failed", err);
  }
  return usernameCache;
}

/** Посилання, яке відкриває Mini App з будь-якого чату (в т.ч. з групи). */
export async function miniAppLink(startParam?: string): Promise<string | undefined> {
  const u = await getBotUsername();
  if (!u) return undefined;
  return `https://t.me/${u}?startapp${startParam ? "=" + encodeURIComponent(startParam) : ""}`;
}
