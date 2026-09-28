import { z } from "zod";
import { competitionTypeEnum, eventStatusEnum, eventTypeEnum, playerStatusEnum, positionEnum } from "@/db/schema";

// Тексти помилок тут не задаємо: handle() показує "перевірте поле «…»" мовою користувача.

/** Текстове поле форми: обрізає пробіли, порожній рядок → null. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s.length ? s : null))
    .nullable()
    .optional();

const url = z
  .string()
  .trim()
  .transform((s) => (s.length ? s : null))
  .pipe(z.url().nullable())
  .nullable()
  .optional();

export const playerInput = z.object({
  fullName: z.string().trim().min(1).max(80),
  number: z.number().int().min(0).max(99).nullable().optional(),
  position: z.enum(positionEnum.enumValues).nullable().optional(),
  status: z.enum(playerStatusEnum.enumValues).default("active"),
  telegramUsername: z
    .string()
    .trim()
    .max(40)
    .transform((s) => s.replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, "") || null)
    .nullable()
    .optional(),
  heightCm: z.number().int().min(120).max(230).nullable().optional(),
  note: text(300),
  /** "Це я": прив'язати картку до Telegram того, хто зберігає. */
  linkMe: z.boolean().optional(),
});
export type PlayerInput = z.infer<typeof playerInput>;
export const playerPatch = playerInput.partial();

export const competitionInput = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(competitionTypeEnum.enumValues).default("league"),
  season: text(20),
  standingsUrl: url,
  shortName: text(12),
  ourName: text(80),
  playoffSpots: z.number().int().min(1).max(16).nullable().optional(),
  isArchived: z.boolean().optional(),
});
export type CompetitionInput = z.infer<typeof competitionInput>;
export const competitionPatch = competitionInput.partial();

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

export const eventInput = z.object({
  type: z.enum(eventTypeEnum.enumValues).default("game"),
  startsAtLocal: localDateTime,
  competitionId: z.number().int().positive().nullable().optional(),
  opponent: text(120),
  isHome: z.boolean().nullable().optional(),
  round: text(60),
  venueName: text(120),
  venueAddress: text(240),
  venueMapUrl: url,
  kit: text(60),
  note: text(1000),
  /** Одразу написати анонс у тред (якщо група прив'язана). */
  announceNow: z.boolean().optional(),
});
export type EventInput = z.infer<typeof eventInput>;

export const eventPatch = eventInput.partial().extend({
  status: z.enum(eventStatusEnum.enumValues).optional(),
  scoreUs: z.number().int().min(0).max(9).nullable().optional(),
  scoreThem: z.number().int().min(0).max(9).nullable().optional(),
});
export type EventPatch = z.infer<typeof eventPatch>;

export const rsvpInput = z.object({
  status: z.enum(["going", "maybe", "not_going"]),
});

/** Адмін відмічає гравця зі складу; status = null знімає відмітку. */
export const playerRsvpInput = z.object({
  playerId: z.number().int().positive(),
  status: z.enum(["going", "maybe", "not_going"]).nullable(),
});

export const settingsInput = z.object({
  teamName: z.string().trim().min(1).max(60),
  timezone: z
    .string()
    .trim()
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }),
  reminderHours: z
    .string()
    .trim()
    .regex(/^(\d{1,3}(\s*,\s*\d{1,3})*)?$/),
  announceDaysBefore: z.number().int().min(0).max(30),
  language: z.enum(["uk", "ru", "en"]),
  arriveMinutes: z.number().int().min(0).max(240),
  lineupRules: z.object({
    minPlayers: z.number().int().min(1).max(20),
    maxPlayers: z.number().int().min(1).max(30),
    positions: z.record(
      z.enum(["setter", "outside", "middle", "opposite", "libero"]),
      z.object({ min: z.number().int().min(0).max(6), max: z.number().int().min(0).max(8) }),
    ),
  }),
});
export type SettingsInput = z.infer<typeof settingsInput>;

/** Результат чужого матчу ліги (або нашого — тоді піде через картку гри). */
export const leagueMatchPatch = z.object({
  setsHome: z.number().int().min(0).max(5).nullable(),
  setsAway: z.number().int().min(0).max(5).nullable(),
  walkover: z.enum(["home", "away"]).nullable(),
});
