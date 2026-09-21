import { and, asc, desc, eq, gte, ilike, lt } from "drizzle-orm";
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
  const [row, settings] = await Promise.all([getEventRow(id), getSettings()]);
  if (!row) return null;
  const { competition, attendance: att, ...event } = row;
  return { event, competition, attendance: att, settings };
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
  const [updated] = await db
    .update(players)
    .set({ telegramUserId: u.id, updatedAt: new Date() })
    .where(eq(players.id, byName.id))
    .returning();
  return updated ?? byName;
}

export async function setRsvp(eventId: number, u: TelegramUser, status: RsvpStatus): Promise<Attendance> {
  const player = await linkPlayerByTelegram(u);
  const displayName = player?.fullName ?? displayNameOf(u);
  const [row] = await db
    .insert(attendance)
    .values({ eventId, telegramUserId: u.id, displayName, playerId: player?.id ?? null, status })
    .onConflictDoUpdate({
      target: [attendance.eventId, attendance.telegramUserId],
      set: { status, displayName, playerId: player?.id ?? null, updatedAt: new Date() },
    })
    .returning();
  return row;
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
