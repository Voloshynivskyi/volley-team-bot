import { getSettings } from "@/db";
import { env } from "@/lib/env";
import { api } from "./api";

const TTL_MS = 5 * 60_000;

// Кеш живе в межах теплого інстансу serverless-функції. Цього достатньо:
// список адмінів групи змінюється рідко, а застарілий кеш живе максимум 5 хв.
let cache: { chatId: number; ids: Set<number>; until: number } | null = null;

export async function getGroupAdminIds(chatId: number): Promise<Set<number>> {
  if (cache && cache.chatId === chatId && cache.until > Date.now()) return cache.ids;
  try {
    const members = await api.getChatAdministrators(chatId);
    const ids = new Set(members.map((m) => m.user.id));
    cache = { chatId, ids, until: Date.now() + TTL_MS };
    return ids;
  } catch (err) {
    console.error("getChatAdministrators failed", err);
    return cache?.chatId === chatId ? cache.ids : new Set();
  }
}

export function invalidateAdminCache() {
  cache = null;
}

export async function isAdmin(userId: number): Promise<boolean> {
  if (env.OWNER_TELEGRAM_ID === userId) return true;
  const s = await getSettings();
  if (!s.chatId) return false;
  const ids = await getGroupAdminIds(s.chatId);
  return ids.has(userId);
}
