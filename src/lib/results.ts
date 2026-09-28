import { and, eq } from "drizzle-orm";
import { db, getSettings, schema } from "@/db";
import { audit, type Actor } from "@/lib/audit";
import { dict } from "@/lib/i18n";
import { sendMvpPoll } from "@/lib/mvp";
import { normTeam } from "@/lib/standings";
import { api } from "@/lib/telegram/api";
import { esc, teamLang } from "@/lib/telegram/messages";
import { refreshEventPosts } from "@/lib/telegram/post";

const { events, leagueMatches, posts, competitions } = schema;

/**
 * Переносить рахунок нашої гри в матч ліги, щоб таблиця рахувалась сама.
 * У розкладі ліги ми можемо бути як господарями, так і гостями.
 */
export async function syncLeagueMatch(eventId: number): Promise<void> {
  const match = await db.query.leagueMatches.findFirst({ where: eq(leagueMatches.eventId, eventId) });
  if (!match) return;
  const [event, comp] = await Promise.all([
    db.query.events.findFirst({ where: eq(events.id, eventId) }),
    db.query.competitions.findFirst({ where: eq(competitions.id, match.competitionId) }),
  ]);
  if (!event) return;
  const weAreHome = comp?.ourName ? normTeam(match.home) === normTeam(comp.ourName) : true;
  const has = event.status === "finished" && event.scoreUs != null && event.scoreThem != null;
  await db
    .update(leagueMatches)
    .set({
      setsHome: has ? (weAreHome ? event.scoreUs : event.scoreThem) : null,
      setsAway: has ? (weAreHome ? event.scoreThem : event.scoreUs) : null,
      walkover: null,
    })
    .where(eq(leagueMatches.id, match.id));
}

/** Перетворює запит "Як зіграли?" у треді на підсумок і прибирає кнопки. */
async function closeResultPrompt(eventId: number, actor: Actor): Promise<void> {
  const prompt = await db.query.posts.findFirst({ where: and(eq(posts.eventId, eventId), eq(posts.kind, "result")) });
  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!prompt || !event || event.scoreUs == null || event.scoreThem == null) return;
  const t = dict(teamLang(await getSettings()));
  const text = [
    `<b>${esc(t.botExtra.resultLine(event.scoreUs > event.scoreThem, event.scoreUs, event.scoreThem, event.opponent ?? "—"))}</b>`,
    esc(t.botExtra.recordedBy(actor.name)),
  ].join("\n");
  try {
    await api.editMessageText(prompt.chatId, prompt.messageId, text, { parse_mode: "HTML" });
  } catch (err) {
    if (!/message is not modified/i.test(String(err))) console.warn("result prompt edit failed", err);
  }
}

/**
 * Записати рахунок гри. Звідси — одне місце для всіх наслідків:
 * статус "зіграно", таблиця ліги, оновлені повідомлення в треді, журнал і голосування MVP.
 */
export async function applyResult(eventId: number, us: number, them: number, actor: Actor): Promise<boolean> {
  const before = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!before) return false;
  const [after] = await db
    .update(events)
    .set({ scoreUs: us, scoreThem: them, status: "finished", updatedAt: new Date() })
    .where(eq(events.id, eventId))
    .returning();

  await syncLeagueMatch(eventId);
  await audit("event", eventId, "result", actor, before, after);
  await refreshEventPosts(eventId);
  await closeResultPrompt(eventId, actor);
  if (after.type === "game") {
    try {
      await sendMvpPoll(eventId);
    } catch (err) {
      console.error("mvp poll failed", err);
    }
  }
  return true;
}
