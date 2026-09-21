import { InlineKeyboard } from "grammy";
import type { Attendance, Competition, Event, Player, Settings } from "@/db/schema";
import { positionShort } from "@/lib/positions";
import { fmtDateTimeLong, fmtDayShort, fmtTime } from "@/lib/time";

export type EventBundle = {
  event: Event;
  competition: Competition | null;
  attendance: Attendance[];
  settings: Settings;
};

export function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function hoursWord(h: number): string {
  const n = Math.abs(h) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return "годин";
  if (n1 > 1 && n1 < 5) return "години";
  if (n1 === 1) return "годину";
  return "годин";
}

export function eventTitle(e: Event): string {
  if (e.type === "training") return "Тренування";
  return e.opponent ? `Гра: ${e.opponent}` : "Гра";
}

function eventIcon(e: Event) {
  return e.type === "training" ? "🏋️" : "🏐";
}

/** Заголовок нагадування залежно від того, за скільки годин воно йде. */
export function reminderHeader(offsetHours: number): string {
  if (offsetHours >= 20 && offsetHours <= 28) return "⏰ Завтра";
  if (offsetHours >= 44 && offsetHours <= 52) return "⏰ Післязавтра";
  return `⏰ Через ${offsetHours} ${hoursWord(offsetHours)}`;
}

/** Повний текст анонсу події для треду (HTML). */
export function buildEventText(b: EventBundle, header?: string): string {
  const { event: e, competition: c, settings: s } = b;
  const tz = s.timezone;
  const lines: string[] = [];

  if (e.status === "cancelled") lines.push("<b>❌ СКАСОВАНО</b>");
  else if (header) lines.push(`<b>${esc(header)}</b>`);

  lines.push(`<b>${eventIcon(e)} ${esc(eventTitle(e))}</b>`);

  if (e.type === "game") {
    const comp = [c?.name, e.round].filter(Boolean).join(", ");
    if (comp) lines.push(esc(comp));
  }

  lines.push(`📅 ${esc(fmtDateTimeLong(e.startsAt, tz))}`);

  if (e.venueName || e.venueAddress) {
    const where = [e.venueName, e.venueAddress].filter(Boolean).join(", ");
    const place = e.venueMapUrl ? `<a href="${esc(e.venueMapUrl)}">${esc(where)}</a>` : esc(where);
    const side = e.type === "game" && e.isHome != null ? (e.isHome ? " — дома" : " — виїзд") : "";
    lines.push(`📍 ${place}${side}`);
  } else if (e.type === "game" && e.isHome != null) {
    lines.push(e.isHome ? "📍 Дома" : "📍 Виїзд");
  }

  if (e.kit) lines.push(`👕 ${esc(e.kit)}`);
  if (e.note) lines.push(`📝 ${esc(e.note)}`);

  if (e.status === "finished" && e.scoreUs != null && e.scoreThem != null) {
    const won = e.scoreUs > e.scoreThem;
    lines.push("", `<b>${won ? "🏆 Перемога" : "Поразка"} ${e.scoreUs}:${e.scoreThem}</b>`);
    return lines.join("\n");
  }

  if (e.status === "scheduled") {
    lines.push("", ...attendanceLines(b.attendance));
  }
  return lines.join("\n");
}

export function attendanceLines(list: Attendance[]): string[] {
  const going = list.filter((a) => a.status === "going");
  const maybe = list.filter((a) => a.status === "maybe");
  const not = list.filter((a) => a.status === "not_going");
  if (!list.length) return ["Ніхто ще не відмітився."];
  const out: string[] = [];
  const names = (xs: Attendance[]) => xs.map((a) => esc(a.displayName)).join(", ");
  out.push(`✅ Ідуть (${going.length})${going.length ? ": " + names(going) : ""}`);
  if (maybe.length) out.push(`🤔 Можливо (${maybe.length}): ${names(maybe)}`);
  if (not.length) out.push(`❌ Не йдуть (${not.length}): ${names(not)}`);
  return out;
}

export function rsvpKeyboard(eventId: number, appLink?: string): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("✅ Іду", `rsvp:${eventId}:going`)
    .text("🤔 Можливо", `rsvp:${eventId}:maybe`)
    .text("❌ Не йду", `rsvp:${eventId}:not_going`);
  if (appLink) kb.row().url("Відкрити розклад", appLink);
  return kb;
}

/** Компактний рядок для /schedule */
export function scheduleLine(e: Event, c: Competition | null, tz: string): string {
  const when = `${fmtDayShort(e.startsAt, tz)}, ${fmtTime(e.startsAt, tz)}`;
  if (e.type === "training") return `🏋️ <b>${esc(when)}</b> — тренування${e.venueName ? ", " + esc(e.venueName) : ""}`;
  const opp = e.opponent ? esc(e.opponent) : "суперник уточнюється";
  const side = e.isHome == null ? "" : e.isHome ? " (дома)" : " (виїзд)";
  const comp = c ? ` — ${esc(c.name)}` : "";
  const cancelled = e.status === "cancelled" ? " ❌ скасовано" : "";
  return `🏐 <b>${esc(when)}</b> — ${opp}${side}${comp}${cancelled}`;
}

export function rosterText(players: Player[], teamName: string): string {
  if (!players.length) return "Склад ще порожній. Додайте гравців у застосунку.";
  const groups: { title: string; status: Player["status"] }[] = [
    { title: "Основа", status: "active" },
    { title: "Резерв", status: "reserve" },
    { title: "Травмовані", status: "injured" },
  ];
  const lines = [`<b>${esc(teamName)}</b>`];
  for (const g of groups) {
    const list = players
      .filter((p) => p.status === g.status)
      .sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.fullName.localeCompare(b.fullName, "uk"));
    if (!list.length) continue;
    lines.push("", `<b>${g.title}</b>`);
    for (const p of list) {
      const num = p.number != null ? `<code>${String(p.number).padStart(2, " ")}</code> ` : "<code>  </code> ";
      const pos = p.position ? ` · ${positionShort(p.position)}` : "";
      lines.push(`${num}${esc(p.fullName)}${pos}`);
    }
  }
  return lines.join("\n");
}
