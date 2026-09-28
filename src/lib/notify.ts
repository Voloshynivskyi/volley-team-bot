import { getSettings } from "@/db";
import { env } from "@/lib/env";
import { dict, isLang } from "@/lib/i18n";
import { api } from "@/lib/telegram/api";

// Одна й та сама помилка не частіше ніж раз на 30 хв — щоб збій у кроні не засипав особисті.
const lastSent = new Map<string, number>();
const THROTTLE_MS = 30 * 60_000;

/** Пише власнику бота в особисті, що щось зламалось. Сама ніколи не кидає помилку. */
export async function notifyOwner(where: string, err: unknown): Promise<void> {
  const owner = env.OWNER_TELEGRAM_ID;
  if (!owner) return;
  const msg = (err instanceof Error ? err.message : String(err)).slice(0, 300);
  const key = `${where}:${msg.slice(0, 80)}`;
  if ((lastSent.get(key) ?? 0) > Date.now() - THROTTLE_MS) return;
  lastSent.set(key, Date.now());
  try {
    let lang: "uk" | "ru" | "en" = "uk";
    try {
      const s = await getSettings();
      if (isLang(s.language)) lang = s.language;
    } catch {
      /* база недоступна — пишемо українською */
    }
    await api.sendMessage(owner, dict(lang).botExtra.errorAlert(where, msg));
  } catch (e) {
    console.error("notifyOwner failed", e);
  }
}
