import { getSettings } from "@/db";
import { env } from "@/lib/env";
import { api } from "./api";

const TTL_MS = 5 * 60_000;

// Кеші живуть у межах теплого інстансу serverless-функції. Цього достатньо:
// склад групи змінюється рідко, а застарілий запис живе максимум 5 хв.
let adminCache: { chatId: number; ids: Set<number>; until: number } | null = null;
const memberCache = new Map<string, { ok: boolean; until: number }>();

export async function getGroupAdminIds(chatId: number): Promise<Set<number>> {
  if (adminCache && adminCache.chatId === chatId && adminCache.until > Date.now()) return adminCache.ids;
  try {
    const members = await api.getChatAdministrators(chatId);
    const ids = new Set(members.map((m) => m.user.id));
    adminCache = { chatId, ids, until: Date.now() + TTL_MS };
    return ids;
  } catch (err) {
    console.error("getChatAdministrators failed", err);
    return adminCache?.chatId === chatId ? adminCache.ids : new Set();
  }
}

async function isChatMember(chatId: number, userId: number): Promise<boolean> {
  const key = `${chatId}:${userId}`;
  const hit = memberCache.get(key);
  if (hit && hit.until > Date.now()) return hit.ok;
  let ok = false;
  try {
    const m = await api.getChatMember(chatId, userId);
    ok =
      m.status === "creator" ||
      m.status === "administrator" ||
      m.status === "member" ||
      (m.status === "restricted" && m.is_member);
  } catch (err) {
    console.error("getChatMember failed", err);
  }
  memberCache.set(key, { ok, until: Date.now() + TTL_MS });
  return ok;
}

export function invalidateAdminCache() {
  adminCache = null;
  memberCache.clear();
}

export type Role = { isAdmin: boolean; isMember: boolean };

/**
 * Адмін — власник бота або адміністратор прив'язаної групи.
 * Учасник — будь-хто, хто зараз у цій групі (адміни теж).
 */
export async function resolveRole(userId: number): Promise<Role> {
  if (env.OWNER_TELEGRAM_ID === userId) return { isAdmin: true, isMember: true };
  const s = await getSettings();
  if (!s.chatId) return { isAdmin: false, isMember: false };
  const admins = await getGroupAdminIds(s.chatId);
  if (admins.has(userId)) return { isAdmin: true, isMember: true };
  return { isAdmin: false, isMember: await isChatMember(s.chatId, userId) };
}
