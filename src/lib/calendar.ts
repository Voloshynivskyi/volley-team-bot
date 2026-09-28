import { randomBytes } from "node:crypto";
import { and, asc, eq, gte } from "drizzle-orm";
import { db, getSettings, schema } from "@/db";
import type { Settings } from "@/db/schema";
import { env } from "@/lib/env";
import { buildIcs, type IcsEvent } from "@/lib/ics";
import { dict, fmtRound } from "@/lib/i18n";
import { arrivalTime, teamLang } from "@/lib/telegram/messages";
import { fmtTime } from "@/lib/time";

/** Секрет посилання-підписки створюється при першому зверненні. */
export async function ensureCalendarToken(s?: Settings): Promise<string> {
  const settings = s ?? (await getSettings());
  if (settings.calendarToken) return settings.calendarToken;
  const token = randomBytes(18).toString("hex");
  await db.update(schema.settings).set({ calendarToken: token }).where(eq(schema.settings.id, 1));
  return token;
}

export function calendarUrl(token: string): string | null {
  return env.APP_URL ? `${env.APP_URL}/cal/${token}.ics` : null;
}

/** Календар команди: ігри й тренування за останні 60 днів і все майбутнє. */
export async function buildTeamCalendar(): Promise<string> {
  const s = await getSettings();
  const lang = teamLang(s);
  const t = dict(lang);
  const since = new Date(Date.now() - 60 * 86_400_000);
  const list = await db.query.events.findMany({
    where: and(gte(schema.events.startsAt, since)),
    orderBy: [asc(schema.events.startsAt)],
    with: { competition: true },
  });
  const host = env.APP_URL ? new URL(env.APP_URL).host : "volley-team-bot";

  const items: IcsEvent[] = list.map((e) => {
    const isGame = e.type === "game";
    const summary = isGame
      ? `🏐 ${s.teamName} — ${e.opponent ?? t.schedule.opponentTbd}`
      : `🏋️ ${t.eventTypes.training} · ${s.teamName}`;
    const arrive = arrivalTime(e, s);
    const score =
      e.status === "finished" && e.scoreUs != null && e.scoreThem != null
        ? `${e.scoreUs > e.scoreThem ? t.event.win : t.event.loss} ${e.scoreUs}:${e.scoreThem}`
        : null;
    const description = [
      [e.competition?.name, fmtRound(t, e.round)].filter(Boolean).join(", ") || null,
      arrive ? t.arrive(fmtTime(arrive, s.timezone)) : null,
      score,
      e.kit,
      e.note,
      e.venueMapUrl,
    ]
      .filter(Boolean)
      .join("\n");
    return {
      uid: `event-${e.id}@${host}`,
      start: e.startsAt,
      end: new Date(e.startsAt.getTime() + (isGame ? 120 : 90) * 60_000),
      summary,
      location: [e.venueName, e.venueAddress].filter(Boolean).join(", ") || null,
      description: description || null,
      cancelled: e.status === "cancelled",
      updated: e.updatedAt,
    };
  });
  return buildIcs(s.teamName, items);
}
