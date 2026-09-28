import { and, asc, desc, eq, gte, ilike, inArray, lt, or } from "drizzle-orm";
import { db, getSettings, schema } from "@/db";
import type { Attendance, Competition, Event, Player, RsvpStatus } from "@/db/schema";
import type { TelegramUser } from "@/lib/telegram/initData";
import type { EventBundle } from "@/lib/telegram/messages";

const { events, competitions, attendance, players } = schema;

export type EventRow = Event & { competition: Competition | null; attendance: Attendance[] };

/** Подія вважається "поточною" ще 3 години після початку — щоб не зникала з екрана під час гри. */
const GRACE_MS = 3 * 3_600_000;

export async function listEvents(scope: "upcoming" | "past", limit = 200): Promise<EventRow[]> {
  const cutoff = new Date(Date.now() - GRACE_MS);
  const rows = await db.query.events.findMany({
    where: scope === "upcoming" ? gte(events.startsAt, cutoff) : lt(events.startsAt, cutoff),
    orderBy: scope === "upcoming" ? [asc(events.startsAt)] : [desc(events.startsAt)],
    limit,
    with: { competition: true, attendance: true },
  });
  return rows;
}

export async function nextScheduledEvent(): Promise<EventRow | null> {
  const cutoff = new Date(Date.now() - GRACE_MS);
  const row = await db.query.events.findFirst({
    where: and(gte(events.startsAt, cutoff), eq(events.status, "scheduled")),
    orderBy: [asc(events.startsAt)],
    with: { competition: true, attendance: true },
  });
  return row ?? null;
}

export async function getEventRow(id: number): Promise<EventRow | null> {
  const row = await db.query.events.findFirst({
    where: eq(events.id, id),
    with: { competition: true, attendance: true },
  });
  return row ?? null;
}

export async function loadEventBundle(id: number): Promise<EventBundle | null> {
  const [row, settings, roster] = await Promise.all([getEventRow(id), getSettings(), listPlayers()]);
  if (!row) return null;
  const { competition, attendance: att, ...event } = row;
  return { event, competition, attendance: att, settings, players: roster };
}

export function displayNameOf(u: TelegramUser): string {
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.username || `id${u.id}`;
}

/**
 * Знаходить гравця за telegram id, або за username і тоді прив'язує id.
 * Так адмін може завести гравця з @username, а прив'язка станеться сама,
 * щойно людина натисне "Іду" або відкриє застосунок.
 */
export async function linkPlayerByTelegram(u: TelegramUser): Promise<Player | null> {
  const byId = await db.query.players.findFirst({ where: eq(players.telegramUserId, u.id) });
  if (byId) return byId;
  if (!u.username) return null;
  const byName = await db.query.players.findFirst({
    where: ilike(players.telegramUsername, u.username),
  });
  if (!byName) return null;
  // Картка вже прив'язана до іншої людини з таким самим username — не чіпаємо.
  if (byName.telegramUserId != null) return null;
  const [updated] = await db
    .update(players)
    .set({ telegramUserId: u.id, updatedAt: new Date() })
    .where(eq(players.id, byName.id))
    .returning();
  await mergeAttendanceForPlayer(byName.id, u.id, byName.fullName);
  return updated ?? byName;
}

/**
 * Після прив'язки Telegram до картки зводимо явку докупи: рядки, де людина
 * відмічалась сама (лише telegram id), і рядки, де за неї відмічав адмін
 * (лише player id), стають одним рядком на подію — лишається свіжіший.
 * Повертає id подій, чиї повідомлення в треді варто перемалювати.
 */
export async function mergeAttendanceForPlayer(
  playerId: number,
  telegramUserId: number,
  displayName: string,
): Promise<number[]> {
  const rows = await db.query.attendance.findMany({
    where: or(eq(attendance.playerId, playerId), eq(attendance.telegramUserId, telegramUserId)),
  });
  const byEvent = new Map<number, Attendance[]>();
  for (const r of rows) byEvent.set(r.eventId, [...(byEvent.get(r.eventId) ?? []), r]);

  for (const list of byEvent.values()) {
    const [keep, ...rest] = list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    if (rest.length) await db.delete(attendance).where(inArray(attendance.id, rest.map((r) => r.id)));
    await db
      .update(attendance)
      .set({ playerId, telegramUserId, displayName })
      .where(eq(attendance.id, keep.id));
  }
  return [...byEvent.keys()];
}

/** Нове ім'я гравця одразу видно у списках явки. Повертає id зачеплених подій. */
export async function syncAttendanceName(playerId: number, displayName: string): Promise<number[]> {
  const rows = await db
    .update(attendance)
    .set({ displayName })
    .where(eq(attendance.playerId, playerId))
    .returning({ eventId: attendance.eventId });
  return [...new Set(rows.map((r) => r.eventId))];
}

/**
 * Запис явки може з'явитись двома шляхами: людина натиснула кнопку сама (є telegram id)
 * або адмін відмітив гравця зі складу (є лише player id). Щоб одна людина не опинилась
 * у списку двічі, шукаємо наявний рядок за будь-яким з двох ключів і оновлюємо його.
 */
async function upsertAttendance(
  eventId: number,
  who: { telegramUserId: number | null; playerId: number | null; displayName: string },
  status: RsvpStatus,
): Promise<Attendance> {
  const keys = [
    who.telegramUserId != null ? eq(attendance.telegramUserId, who.telegramUserId) : undefined,
    who.playerId != null ? eq(attendance.playerId, who.playerId) : undefined,
  ].filter((x) => x !== undefined);
  const existing = await db.query.attendance.findMany({
    where: and(eq(attendance.eventId, eventId), or(...keys)),
  });

  if (existing.length) {
    const [keep, ...dupes] = existing;
    if (dupes.length) await db.delete(attendance).where(inArray(attendance.id, dupes.map((d) => d.id)));
    const [row] = await db
      .update(attendance)
      .set({
        status,
        displayName: who.displayName,
        telegramUserId: who.telegramUserId ?? keep.telegramUserId,
        playerId: who.playerId ?? keep.playerId,
        updatedAt: new Date(),
      })
      .where(eq(attendance.id, keep.id))
      .returning();
    return row;
  }

  const [row] = await db.insert(attendance).values({ eventId, ...who, status }).returning();
  return row;
}

/** Людина відмічається сама — кнопкою в треді або в застосунку. */
export async function setRsvp(eventId: number, u: TelegramUser, status: RsvpStatus): Promise<Attendance> {
  const player = await linkPlayerByTelegram(u);
  return upsertAttendance(
    eventId,
    { telegramUserId: u.id, playerId: player?.id ?? null, displayName: player?.fullName ?? displayNameOf(u) },
    status,
  );
}

/** Адмін відмічає гравця зі складу. status = null — зняти відмітку. */
export async function setPlayerRsvp(eventId: number, playerId: number, status: RsvpStatus | null): Promise<void> {
  const player = await db.query.players.findFirst({ where: eq(players.id, playerId) });
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  if (status === null) {
    await db.delete(attendance).where(and(eq(attendance.eventId, eventId), eq(attendance.playerId, playerId)));
    return;
  }
  await upsertAttendance(
    eventId,
    { telegramUserId: player.telegramUserId, playerId, displayName: player.fullName },
    status,
  );
}

export async function listCompetitions(includeArchived = false): Promise<Competition[]> {
  return db.query.competitions.findMany({
    where: includeArchived ? undefined : eq(competitions.isArchived, false),
    orderBy: [asc(competitions.name)],
  });
}

export async function listPlayers(): Promise<Player[]> {
  const rows = await db.query.players.findMany();
  return rows.sort(
    (a, b) => (a.number ?? 999) - (b.number ?? 999) || a.fullName.localeCompare(b.fullName, "uk"),
  );
}
