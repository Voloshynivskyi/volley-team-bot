import { z } from "zod";
import { competitionTypeEnum, eventStatusEnum, eventTypeEnum, playerStatusEnum, positionEnum } from "@/db/schema";

/** Текстове поле форми: обрізає пробіли, порожній рядок → null. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `не більше ${max} символів`)
    .transform((s) => (s.length ? s : null))
    .nullable()
    .optional();

const url = z
  .string()
  .trim()
  .transform((s) => (s.length ? s : null))
  .pipe(z.url("має бути посиланням").nullable())
  .nullable()
  .optional();

export const playerInput = z.object({
  fullName: z.string().trim().min(1, "вкажіть ім'я").max(80),
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
});
export type PlayerInput = z.infer<typeof playerInput>;
export const playerPatch = playerInput.partial();

export const competitionInput = z.object({
  name: z.string().trim().min(1, "вкажіть назву").max(80),
  type: z.enum(competitionTypeEnum.enumValues).default("league"),
  season: text(20),
  standingsUrl: url,
  isArchived: z.boolean().optional(),
});
export type CompetitionInput = z.infer<typeof competitionInput>;
export const competitionPatch = competitionInput.partial();

const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "вкажіть дату й час");

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

export const settingsInput = z.object({
  teamName: z.string().trim().min(1, "вкажіть назву").max(60),
  timezone: z
    .string()
    .trim()
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("uk", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "невідомий часовий пояс"),
  reminderHours: z
    .string()
    .trim()
    .regex(/^(\d{1,3}(\s*,\s*\d{1,3})*)?$/, "список годин через кому, напр. 24, 2"),
  announceDaysBefore: z.number().int().min(0).max(30),
});
export type SettingsInput = z.infer<typeof settingsInput>;
