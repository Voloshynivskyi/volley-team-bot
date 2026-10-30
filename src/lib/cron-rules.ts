import { formatInTimeZone } from "date-fns-tz";

/** Години нагадувань із налаштувань ("24, 2") → [24, 2], від більшого до меншого. */
export function parseReminderHours(raw: string): number[] {
  return [...new Set(raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0))].sort(
    (a, b) => b - a,
  );
}

/**
 * Нагадування за H годин шлеться, коли до події лишилось (H-1.5, H] годин.
 * Вікно ширше за годину, бо крон ходить раз на годину (частіше — і безкоштовний Neon
 * не встигає засинати, вичерпуючи місячну квоту). Повторно не шлеться: бот пам'ятає надіслане.
 * Подія, створена за 30 хв до початку, так само не отримає застарілого "за 24 години".
 */
export const REMINDER_WINDOW_H = 1.5;
export function dueReminders(hoursLeft: number, hours: number[]): number[] {
  return hours.filter((h) => hoursLeft <= h && hoursLeft > Math.max(0, h - REMINDER_WINDOW_H));
}

/** Тривога за нестачу гравців — між двома добами й добою до гри (далі вже йде нагадування). */
export const SHORTAGE_FROM_H = 48;
export function shortageDue(hoursLeft: number): boolean {
  return hoursLeft <= SHORTAGE_FROM_H && hoursLeft > 24;
}

/** Питаємо рахунок через 2 год після початку; про ігри, старші за тиждень, уже не нагадуємо. */
export function resultPromptDue(startsAt: Date, now: Date): boolean {
  const since = now.getTime() - startsAt.getTime();
  return since >= 2 * 3_600_000 && since <= 7 * 24 * 3_600_000;
}

/** Закріплений анонс знімаємо через 3 год після початку гри. */
export function unpinDue(startsAt: Date, now: Date): boolean {
  return now.getTime() - startsAt.getTime() >= 3 * 3_600_000;
}

/** Ключ ISO-тижня в зоні команди: "2026-W40". */
export function isoWeekKey(now: Date, tz: string): string {
  return formatInTimeZone(now, tz, "RRRR-'W'II");
}

/** Дайджест — у понеділок з 9:00 за часом команди. */
export function digestTime(now: Date, tz: string): boolean {
  return formatInTimeZone(now, tz, "i") === "1" && Number(formatInTimeZone(now, tz, "H")) >= 9;
}

/** Межі поточного тижня (пн 00:00 — наступний пн 00:00) у зоні команди, як UTC-дати. */
export function weekRange(now: Date, tz: string): { from: Date; to: Date } {
  const dow = Number(formatInTimeZone(now, tz, "i")); // 1 = пн
  const day = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const offset = formatInTimeZone(now, tz, "xxx");
  const startLocal = new Date(`${day}T00:00:00${offset}`);
  const from = new Date(startLocal.getTime() - (dow - 1) * 86_400_000);
  return { from, to: new Date(from.getTime() + 7 * 86_400_000) };
}
