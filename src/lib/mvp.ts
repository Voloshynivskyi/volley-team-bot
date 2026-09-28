import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { InlineKeyboard } from "grammy";
import { db, getSettings, schema } from "@/db";
import type { Player } from "@/db/schema";
import { listPlayers } from "@/lib/events";
import { dict } from "@/lib/i18n";
import { api } from "@/lib/telegram/api";
import { esc, teamLang } from "@/lib/telegram/messages";
import type { TelegramUser } from "@/lib/telegram/initData";

const { posts, mvpVotes, events, attendance } = schema;

const POLL_HOURS = 24;

function shortLabel(p: Player): string {
  const last = p.fullName.trim().split(/\s+/).pop() ?? p.fullName;
  return p.number != null ? `${p.number} · ${last}` : last;
}

/** Кандидати: хто відмітився "іду"; якщо ніхто — увесь склад без травмованих. */
async function candidates(eventId: number): Promise<Player[]> {
  const roster = await listPlayers();
  const going = await db.query.attendance.findMany({
    where: and(eq(attendance.eventId, eventId), eq(attendance.status, "going"), isNotNull(attendance.playerId)),
  });
  const ids = new Set(going.map((a) => a.playerId));
  const list = ids.size ? roster.filter((p) => ids.has(p.id)) : roster.filter((p) => p.status !== "injured");
  return list;
}

async function voteCount(eventId: number): Promise<number> {
  const rows = await db.select({ id: mvpVotes.id }).from(mvpVotes).where(eq(mvpVotes.eventId, eventId));
  return rows.length;
}

export type MvpSummary = { names: string[]; votes: number; closed: boolean } | null;

/** Переможці голосування (при рівності — кілька). */
export async function mvpSummary(eventId: number): Promise<MvpSummary> {
  const post = await db.query.posts.findFirst({ where: and(eq(posts.eventId, eventId), eq(posts.kind, "mvp")) });
  if (!post) return null;
  const votes = await db.query.mvpVotes.findMany({ where: eq(mvpVotes.eventId, eventId), with: { player: true } });
  const tally = new Map<number, { name: string; n: number }>();
  for (const v of votes) {
    const cur = tally.get(v.playerId) ?? { name: v.player.fullName, n: 0 };
    cur.n++;
    tally.set(v.playerId, cur);
  }
  const max = Math.max(0, ...[...tally.values()].map((x) => x.n));
  const names = max ? [...tally.values()].filter((x) => x.n === max).map((x) => x.name) : [];
  return { names, votes: max, closed: post.closedAt != null };
}

async function opponentOf(eventId: number): Promise<string> {
  const e = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  return e?.opponent ?? "—";
}

/** Публікує голосування MVP у тред після гри. Ідемпотентно. */
export async function sendMvpPoll(eventId: number): Promise<boolean> {
  const s = await getSettings();
  if (!s.chatId) return false;
  const existing = await db.query.posts.findFirst({ where: and(eq(posts.eventId, eventId), eq(posts.kind, "mvp")) });
  if (existing) return false;

  const kb = await pollKeyboard(eventId);
  if (!kb) return false;
  const t = dict(teamLang(s));
  const opp = await opponentOf(eventId);
  const msg = await api.sendMessage(s.chatId, `<b>${esc(t.botExtra.mvpPrompt(opp))}</b>\n${t.botExtra.mvpVotes(0)}`, {
    message_thread_id: s.threadId ?? undefined,
    parse_mode: "HTML",
    reply_markup: kb,
  });
  await db
    .insert(posts)
    .values({ eventId, chatId: s.chatId, threadId: s.threadId ?? null, messageId: msg.message_id, kind: "mvp" })
    .onConflictDoNothing();
  return true;
}

export type VoteResult = { ok: true; name: string } | { ok: false; reason: "self" | "closed" | "invalid" };

export async function voteMvp(eventId: number, voter: TelegramUser, playerId: number): Promise<VoteResult> {
  const post = await db.query.posts.findFirst({ where: and(eq(posts.eventId, eventId), eq(posts.kind, "mvp")) });
  if (!post) return { ok: false, reason: "invalid" };
  if (post.closedAt) return { ok: false, reason: "closed" };
  const player = await db.query.players.findFirst({ where: eq(schema.players.id, playerId) });
  if (!player) return { ok: false, reason: "invalid" };
  if (player.telegramUserId === voter.id) return { ok: false, reason: "self" };

  await db
    .insert(mvpVotes)
    .values({ eventId, voterId: voter.id, playerId })
    .onConflictDoUpdate({ target: [mvpVotes.eventId, mvpVotes.voterId], set: { playerId, createdAt: new Date() } });

  // Показуємо лише кількість голосів, щоб не підштовхувати до чужого вибору.
  const s = await getSettings();
  const t = dict(teamLang(s));
  const opp = await opponentOf(eventId);
  try {
    await api.editMessageText(
      post.chatId,
      post.messageId,
      `<b>${esc(t.botExtra.mvpPrompt(opp))}</b>\n${t.botExtra.mvpVotes(await voteCount(eventId))}`,
      { parse_mode: "HTML", reply_markup: (await pollKeyboard(eventId)) ?? undefined },
    );
  } catch (err) {
    if (!/message is not modified/i.test(String(err))) console.warn("mvp edit failed", err);
  }
  return { ok: true, name: player.fullName };
}

async function pollKeyboard(eventId: number): Promise<InlineKeyboard | null> {
  const list = await candidates(eventId);
  if (!list.length) return null;
  const kb = new InlineKeyboard();
  list.forEach((p, i) => {
    kb.text(shortLabel(p), `mvp:${eventId}:${p.id}`);
    if (i % 2 === 1) kb.row();
  });
  return kb;
}

/** Підбиває підсумок голосувань, яким уже добу. */
export async function closeDueMvpPolls(now = new Date()): Promise<number[]> {
  const due = await db.query.posts.findMany({
    where: and(
      eq(posts.kind, "mvp"),
      isNull(posts.closedAt),
      lt(posts.sentAt, new Date(now.getTime() - POLL_HOURS * 3_600_000)),
    ),
  });
  const s = await getSettings();
  const t = dict(teamLang(s));
  const closed: number[] = [];
  for (const p of due) {
    await db.update(posts).set({ closedAt: now }).where(eq(posts.id, p.id));
    const sum = await mvpSummary(p.eventId);
    const opp = await opponentOf(p.eventId);
    const text = sum?.names.length
      ? t.botExtra.mvpWinner(opp, sum.names.join(", "), sum.votes)
      : t.botExtra.mvpNoVotes(opp);
    try {
      await api.editMessageText(p.chatId, p.messageId, `<b>${esc(text)}</b>`, { parse_mode: "HTML" });
    } catch (err) {
      if (!/message is not modified/i.test(String(err))) console.warn("mvp close edit failed", err);
    }
    closed.push(p.eventId);
  }
  return closed;
}

export type SeasonMvpRow = { playerId: number; fullName: string; number: number | null; wins: number };

/** Скільки разів кожен ставав MVP (у завершених голосуваннях). */
export async function seasonMvp(): Promise<SeasonMvpRow[]> {
  const closedPolls = await db.query.posts.findMany({ where: and(eq(posts.kind, "mvp"), isNotNull(posts.closedAt)) });
  const roster = new Map((await listPlayers()).map((p) => [p.id, p]));
  const wins = new Map<number, number>();
  for (const poll of closedPolls) {
    const votes = await db.query.mvpVotes.findMany({ where: eq(mvpVotes.eventId, poll.eventId) });
    const tally = new Map<number, number>();
    for (const v of votes) tally.set(v.playerId, (tally.get(v.playerId) ?? 0) + 1);
    const max = Math.max(0, ...tally.values());
    if (!max) continue;
    for (const [pid, n] of tally) if (n === max) wins.set(pid, (wins.get(pid) ?? 0) + 1);
  }
  return [...wins.entries()]
    .map(([playerId, w]) => ({
      playerId,
      fullName: roster.get(playerId)?.fullName ?? "—",
      number: roster.get(playerId)?.number ?? null,
      wins: w,
    }))
    .sort((a, b) => b.wins - a.wins || a.fullName.localeCompare(b.fullName));
}
