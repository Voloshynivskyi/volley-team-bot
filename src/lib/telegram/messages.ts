import { InlineKeyboard } from "grammy";
import type { Attendance, Competition, Event, Player, Settings } from "@/db/schema";
import { dict, fmtRound, isLang, ucFirst, type Dict, type Lang } from "@/lib/i18n";
import { checkLineup, nonResponders, parseLineupRules, type LineupCheck } from "@/lib/lineup";
import { positionShort, RSVP_EMOJI, RSVP_VALUES } from "@/lib/positions";
import { fmtDateTimeLong, fmtDayShort, fmtTime } from "@/lib/time";

export type EventBundle = {
  event: Event;
  competition: Competition | null;
  attendance: Attendance[];
  settings: Settings;
  players: Player[];
};

/** Мова повідомлень бота в групі (налаштування команди). */
export function teamLang(s: Settings): Lang {
  return isLang(s.language) ? s.language : "uk";
}

export function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Час збору: початок мінус налаштовані хвилини. */
export function arrivalTime(e: Event, s: Settings): Date | null {
  if (e.type !== "game" || s.arriveMinutes <= 0) return null;
  return new Date(e.startsAt.getTime() - s.arriveMinutes * 60_000);
}

function eventTitle(t: Dict, e: Event): string {
  if (e.type === "training") return t.eventTypes.training;
  return e.opponent ? t.bot.gameVs(e.opponent) : t.eventTypes.game;
}

function eventIcon(e: Event) {
  return e.type === "training" ? "🏋️" : "🏐";
}

/** Заголовок нагадування залежно від того, за скільки годин воно йде. */
export function reminderHeader(t: Dict, offsetHours: number): string {
  if (offsetHours >= 20 && offsetHours <= 28) return `⏰ ${t.bot.tomorrow}`;
  if (offsetHours >= 44 && offsetHours <= 52) return `⏰ ${t.bot.dayAfter}`;
  return `⏰ ${t.bot.inHours(offsetHours)}`;
}

export function lineupFor(b: EventBundle): LineupCheck {
  return checkLineup(parseLineupRules(b.settings.lineupRules), b.attendance, b.players);
}

export function gapsText(t: Dict, check: LineupCheck): string {
  return check.gaps
    .map((g) => `${t.positions[g.position].label.toLowerCase()}${g.need > 1 ? ` ×${g.need}` : ""}`)
    .join(", ");
}

/** Згадка, що доходить сповіщенням: за id (працює й без username) або @username. */
function mention(p: Player): string {
  if (p.telegramUserId != null) return `<a href="tg://user?id=${p.telegramUserId}">${esc(p.fullName)}</a>`;
  if (p.telegramUsername) return `@${esc(p.telegramUsername)}`;
  return esc(p.fullName);
}

export type TextOptions = {
  header?: string;
  /** Додати рядок "ще не відповіли" зі згадками — для нагадувань за добу й тривоги. */
  mentionSilent?: boolean;
};

/** Повний текст анонсу події (HTML). */
export function buildEventText(b: EventBundle, lang: Lang, opts: TextOptions = {}): string {
  const t = dict(lang);
  const { event: e, competition: c, settings: s } = b;
  const tz = s.timezone;
  const lines: string[] = [];

  if (e.status === "cancelled") lines.push(`<b>❌ ${t.bot.cancelled}</b>`);
  else if (opts.header) lines.push(`<b>${esc(opts.header)}</b>`);

  lines.push(`<b>${eventIcon(e)} ${esc(eventTitle(t, e))}</b>`);

  if (e.type === "game") {
    const comp = [c?.name, fmtRound(t, e.round)].filter(Boolean).join(", ");
    if (comp) lines.push(esc(comp));
  }

  const arrive = arrivalTime(e, s);
  const when = fmtDateTimeLong(e.startsAt, tz, lang);
  lines.push(`📅 ${esc(when)}${arrive ? ` · <b>${esc(t.arriveLower(fmtTime(arrive, tz)))}</b>` : ""}`);

  const side = e.type === "game" && e.isHome != null ? (e.isHome ? t.schedule.home : t.schedule.away) : null;
  if (e.venueName || e.venueAddress) {
    const where = [e.venueName, e.venueAddress].filter(Boolean).join(", ");
    const place = e.venueMapUrl ? `<a href="${esc(e.venueMapUrl)}">${esc(where)}</a>` : esc(where);
    lines.push(`📍 ${place}${side ? ` — ${side}` : ""}`);
  } else if (side) {
    lines.push(`📍 ${ucFirst(side)}`);
  }

  if (e.kit) lines.push(`👕 ${esc(e.kit)}`);
  if (e.note) lines.push(`📝 ${esc(e.note)}`);

  if (e.status === "finished" && e.scoreUs != null && e.scoreThem != null) {
    const won = e.scoreUs > e.scoreThem;
    lines.push("", `<b>${won ? `🏆 ${t.event.win}` : t.event.loss} ${e.scoreUs}:${e.scoreThem}</b>`);
    return lines.join("\n");
  }

  if (e.status !== "scheduled") return lines.join("\n");

  lines.push("", ...attendanceLines(t, b.attendance));

  if (e.type === "game") {
    const check = lineupFor(b);
    if (check.ok) lines.push(t.botExtra.lineupOk(check.going));
    else {
      lines.push(t.botExtra.lineupShort(check.going, check.minPlayers));
      if (check.gaps.length) lines.push(esc(t.botExtra.lineupGaps(gapsText(t, check))));
    }
  }

  if (opts.mentionSilent) {
    const silent = nonResponders(b.attendance, b.players);
    if (silent.length) lines.push("", t.botExtra.nonResponders(silent.map(mention).join(", ")));
  }
  return lines.join("\n");
}

function attendanceLines(t: Dict, list: Attendance[]): string[] {
  if (!list.length) return [t.bot.nobodyYet];
  const names = (xs: Attendance[]) => xs.map((a) => esc(a.displayName)).join(", ");
  const out: string[] = [];
  for (const s of RSVP_VALUES) {
    const xs = list.filter((a) => a.status === s);
    // Рядок "ідуть" показуємо завжди, решту — лише коли там хтось є.
    if (!xs.length && s !== "going") continue;
    out.push(`${RSVP_EMOJI[s]} ${t.rsvpGroups[s]} (${xs.length})${xs.length ? ": " + names(xs) : ""}`);
  }
  return out;
}

export function rsvpKeyboard(lang: Lang, eventId: number, appLink?: string): InlineKeyboard {
  const t = dict(lang);
  const kb = new InlineKeyboard();
  for (const s of RSVP_VALUES) kb.text(`${RSVP_EMOJI[s]} ${t.rsvp[s]}`, `rsvp:${eventId}:${s}`);
  if (appLink) kb.row().url(t.bot.openSchedule, appLink);
  return kb;
}

/** Кнопки рахунку. У регулярці ALG і OMW завжди рівно 3 сети. */
export function scoreKeyboard(lang: Lang, eventId: number, appLink?: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const [us, them] of [
    [3, 0],
    [2, 1],
    [1, 2],
    [0, 3],
  ]) {
    kb.text(`${us}:${them}`, `score:${eventId}:${us}:${them}`);
  }
  if (appLink) kb.row().url(dict(lang).botExtra.otherScore, appLink);
  return kb;
}

/** Компактний рядок для /schedule і дайджесту. */
export function scheduleLine(lang: Lang, e: Event, c: Competition | null, tz: string, lineup?: LineupCheck): string {
  const t = dict(lang);
  const when = `${fmtDayShort(e.startsAt, tz, lang)}, ${fmtTime(e.startsAt, tz)}`;
  if (e.type === "training") {
    return `🏋️ <b>${esc(when)}</b> — ${t.bot.trainingLower}${e.venueName ? ", " + esc(e.venueName) : ""}`;
  }
  const opp = e.opponent ? esc(e.opponent) : t.bot.opponentTbd;
  const side = e.isHome == null ? "" : ` (${e.isHome ? t.schedule.home : t.schedule.away})`;
  const comp = c ? ` — ${esc(c.shortName ?? c.name)}` : "";
  const cancelled = e.status === "cancelled" ? ` ❌ ${t.bot.cancelledLower}` : "";
  const squad = lineup && e.status === "scheduled" ? ` · ${lineup.ok ? "✅" : "⚠️"} ${lineup.going}/${lineup.minPlayers}` : "";
  return `🏐 <b>${esc(when)}</b> — ${opp}${side}${comp}${cancelled}${squad}`;
}

export function rosterText(lang: Lang, players: Player[], teamName: string): string {
  const t = dict(lang);
  if (!players.length) return t.bot.rosterEmpty;
  const groups: { title: string; status: Player["status"] }[] = [
    { title: t.playerStatus.active, status: "active" },
    { title: t.playerStatus.reserve, status: "reserve" },
    { title: t.bot.injuredGroup, status: "injured" },
  ];
  const lines = [`<b>${esc(teamName)}</b>`];
  for (const g of groups) {
    const list = players
      .filter((p) => p.status === g.status)
      .sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.fullName.localeCompare(b.fullName));
    if (!list.length) continue;
    lines.push("", `<b>${g.title}</b>`);
    for (const p of list) {
      const num = p.number != null ? `<code>${String(p.number).padStart(2, " ")}</code> ` : "<code>  </code> ";
      const pos = p.position ? ` · ${positionShort(t, p.position)}` : "";
      lines.push(`${num}${esc(p.fullName)}${pos}`);
    }
  }
  return lines.join("\n");
}
