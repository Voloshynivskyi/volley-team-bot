import { relations } from "drizzle-orm";
import { attendance, competitions, events, leagueMatches, mvpVotes, players, posts } from "./schema";

export const eventsRelations = relations(events, ({ one, many }) => ({
  competition: one(competitions, { fields: [events.competitionId], references: [competitions.id] }),
  attendance: many(attendance),
  posts: many(posts),
  mvpVotes: many(mvpVotes),
}));

export const competitionsRelations = relations(competitions, ({ many }) => ({
  events: many(events),
  leagueMatches: many(leagueMatches),
}));

export const leagueMatchesRelations = relations(leagueMatches, ({ one }) => ({
  competition: one(competitions, { fields: [leagueMatches.competitionId], references: [competitions.id] }),
  event: one(events, { fields: [leagueMatches.eventId], references: [events.id] }),
}));

export const mvpVotesRelations = relations(mvpVotes, ({ one }) => ({
  event: one(events, { fields: [mvpVotes.eventId], references: [events.id] }),
  player: one(players, { fields: [mvpVotes.playerId], references: [players.id] }),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  event: one(events, { fields: [attendance.eventId], references: [events.id] }),
  player: one(players, { fields: [attendance.playerId], references: [players.id] }),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  event: one(events, { fields: [posts.eventId], references: [events.id] }),
}));
