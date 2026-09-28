import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const positionEnum = pgEnum("position", [
  "setter",
  "opposite",
  "middle",
  "outside",
  "libero",
  "universal",
]);
export const playerStatusEnum = pgEnum("player_status", ["active", "reserve", "injured"]);
export const competitionTypeEnum = pgEnum("competition_type", ["league", "tournament", "friendly"]);
export const eventTypeEnum = pgEnum("event_type", ["game", "training"]);
export const eventStatusEnum = pgEnum("event_status", ["scheduled", "finished", "cancelled"]);
export const rsvpEnum = pgEnum("rsvp_status", ["going", "maybe", "not_going"]);
export const postKindEnum = pgEnum("post_kind", ["announce", "reminder", "shortage", "result", "mvp"]);

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  number: integer("number"),
  position: positionEnum("position"),
  status: playerStatusEnum("status").notNull().default("active"),
  telegramUserId: bigint("telegram_user_id", { mode: "number" }).unique(),
  telegramUsername: text("telegram_username"),
  heightCm: integer("height_cm"),
  photoUrl: text("photo_url"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const competitions = pgTable("competitions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: competitionTypeEnum("type").notNull().default("league"),
  season: text("season"),
  standingsUrl: text("standings_url"),
  /** Коротко для перемикачів: "ALG", "OMW". */
  shortName: text("short_name"),
  /** Як наша команда записана в розкладі ліги: "REDMOON", "RED Moon". */
  ourName: text("our_name"),
  /** Скільки перших місць виходять у плей-оф (null — невідомо). */
  playoffSpots: integer("playoff_spots"),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  type: eventTypeEnum("type").notNull().default("game"),
  competitionId: integer("competition_id").references(() => competitions.id, { onDelete: "set null" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  opponent: text("opponent"),
  isHome: boolean("is_home"),
  round: text("round"),
  venueName: text("venue_name"),
  venueAddress: text("venue_address"),
  venueMapUrl: text("venue_map_url"),
  kit: text("kit"),
  note: text("note"),
  status: eventStatusEnum("status").notNull().default("scheduled"),
  scoreUs: integer("score_us"),
  scoreThem: integer("score_them"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attendance = pgTable(
  "attendance",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    // null — коли адмін відмітив гравця, ще не прив'язаного до Telegram.
    telegramUserId: bigint("telegram_user_id", { mode: "number" }),
    displayName: text("display_name").notNull(),
    playerId: integer("player_id").references(() => players.id, { onDelete: "set null" }),
    status: rsvpEnum("status").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("attendance_event_user").on(t.eventId, t.telegramUserId),
    unique("attendance_event_player").on(t.eventId, t.playerId),
  ],
);

// Повідомлення, які бот уже відправив у тред по події. Потрібно, щоб
// не дублювати нагадування і щоб редагувати список явки на місці.
export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    chatId: bigint("chat_id", { mode: "number" }).notNull(),
    threadId: integer("thread_id"),
    messageId: integer("message_id").notNull(),
    kind: postKindEnum("kind").notNull(),
    offsetHours: integer("offset_hours").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    pinned: boolean("pinned").notNull().default(false),
    /** Бот прибрав повідомлення з треду (старе нагадування). Рядок лишається для ідемпотентності. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /** Для голосування MVP: коли підбито підсумок. */
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [unique("posts_event_kind_offset").on(t.eventId, t.kind, t.offsetHours)],
);

// Один рядок з id = 1.
export const settings = pgTable("settings", {
  id: integer("id").primaryKey(),
  teamName: text("team_name").notNull().default("Наша команда"),
  chatId: bigint("chat_id", { mode: "number" }),
  threadId: integer("thread_id"),
  chatTitle: text("chat_title"),
  timezone: text("timezone").notNull().default("Europe/Kyiv"),
  reminderHours: text("reminder_hours").notNull().default("24,2"),
  /** Мова повідомлень бота в групі: uk | ru | en. */
  language: text("language").notNull().default("uk"),
  announceDaysBefore: integer("announce_days_before").notNull().default(3),
  /** За скільки хвилин до початку гри треба бути на місці. */
  arriveMinutes: integer("arrive_minutes").notNull().default(45),
  /** Вимоги до складу на гру (JSON, див. lib/lineup). null — типові. */
  lineupRules: text("lineup_rules"),
  /** Секрет для посилання-підписки на календар. */
  calendarToken: text("calendar_token"),
  lastDigestWeek: text("last_digest_week"),
  lastBackupWeek: text("last_backup_week"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Player = typeof players.$inferSelect;
export type Competition = typeof competitions.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type Position = (typeof positionEnum.enumValues)[number];
export type PlayerStatus = (typeof playerStatusEnum.enumValues)[number];
export type EventType = (typeof eventTypeEnum.enumValues)[number];
export type EventStatus = (typeof eventStatusEnum.enumValues)[number];
export type CompetitionType = (typeof competitionTypeEnum.enumValues)[number];
export type RsvpStatus = (typeof rsvpEnum.enumValues)[number];

/** Усі матчі ліги, включно з чужими — для турнірної таблиці. */
export const leagueMatches = pgTable("league_matches", {
  id: serial("id").primaryKey(),
  competitionId: integer("competition_id")
    .notNull()
    .references(() => competitions.id, { onDelete: "cascade" }),
  round: integer("round"),
  matchNo: integer("match_no"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  home: text("home").notNull(),
  away: text("away").notNull(),
  setsHome: integer("sets_home"),
  setsAway: integer("sets_away"),
  /** Хто віддав walkover: "home" | "away". */
  walkover: text("walkover"),
  postponed: boolean("postponed").notNull().default(false),
  /** Наш матч — пов'язана подія з розкладу; рахунок береться з неї. */
  eventId: integer("event_id").references(() => events.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mvpVotes = pgTable(
  "mvp_votes",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    voterId: bigint("voter_id", { mode: "number" }).notNull(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("mvp_votes_event_voter").on(t.eventId, t.voterId)],
);

/** Хто, коли й що змінив. */
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  action: text("action").notNull(),
  actorId: bigint("actor_id", { mode: "number" }),
  actorName: text("actor_name").notNull(),
  changes: jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LeagueMatch = typeof leagueMatches.$inferSelect;
export type MvpVote = typeof mvpVotes.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type PostKind = (typeof postKindEnum.enumValues)[number];
