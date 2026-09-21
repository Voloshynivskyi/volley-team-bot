import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { uk } from "date-fns/locale";

export const DEFAULT_TZ = "Europe/Kyiv";

/** "2026-10-04T19:00" (значення datetime-local) у зоні команди → Date (UTC). */
export function localInputToDate(value: string, tz: string): Date {
  return fromZonedTime(value, tz);
}

/** Date → значення для <input type="datetime-local"> у зоні команди. */
export function dateToLocalInput(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "yyyy-MM-dd'T'HH:mm");
}

export function fmtTime(date: Date, tz: string) {
  return formatInTimeZone(date, tz, "HH:mm");
}

/** "субота, 4 жовтня" */
export function fmtDayLong(date: Date, tz: string) {
  return formatInTimeZone(date, tz, "EEEE, d MMMM", { locale: uk });
}

/** "сб, 4 жовт." */
export function fmtDayShort(date: Date, tz: string) {
  return formatInTimeZone(date, tz, "EEEEEE, d MMM", { locale: uk });
}

export function fmtDayNumber(date: Date, tz: string) {
  return formatInTimeZone(date, tz, "d");
}

export function fmtWeekdayShort(date: Date, tz: string) {
  return formatInTimeZone(date, tz, "EEEEEE", { locale: uk });
}

/** "жовтень 2026" — заголовок групи в розкладі */
export function fmtMonthYear(date: Date, tz: string) {
  return formatInTimeZone(date, tz, "LLLL yyyy", { locale: uk });
}

export function monthKey(date: Date, tz: string) {
  return formatInTimeZone(date, tz, "yyyy-MM");
}

/** "субота, 4 жовтня, 19:00" — для повідомлень бота */
export function fmtDateTimeLong(date: Date, tz: string) {
  return `${fmtDayLong(date, tz)}, ${fmtTime(date, tz)}`;
}

export function hoursUntil(date: Date, now = new Date()) {
  return (date.getTime() - now.getTime()) / 3_600_000;
}

/** Різниця в календарних днях у зоні команди (0 — сьогодні, 1 — завтра, -1 — вчора). */
export function calendarDaysFromToday(date: Date, tz: string, now = new Date()): number {
  const toUtcDay = (d: Date) => {
    const [y, m, day] = formatInTimeZone(d, tz, "yyyy-MM-dd").split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((toUtcDay(date) - toUtcDay(now)) / 86_400_000);
}

/** Найближчий зручний дефолт для нової події: завтра о 19:00 у зоні команди. */
export function defaultNewEventInput(tz: string): string {
  const tomorrow = new Date(Date.now() + 24 * 3_600_000);
  return `${formatInTimeZone(tomorrow, tz, "yyyy-MM-dd")}T19:00`;
}
