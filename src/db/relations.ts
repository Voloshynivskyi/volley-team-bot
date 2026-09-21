import { relations } from "drizzle-orm";
import { attendance, competitions, events, players, posts } from "./schema";

export const eventsRelations = relations(events, ({ one, many }) => ({
  competition: one(competitions, { fields: [events.competitionId], references: [competitions.id] }),
  attendance: many(attendance),
  posts: many(posts),
}));

export const competitionsRelations = relations(competitions, ({ many }) => ({
  events: many(events),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  event: one(events, { fields: [attendance.eventId], references: [events.id] }),
  player: one(players, { fields: [attendance.playerId], references: [players.id] }),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  event: one(events, { fields: [posts.eventId], references: [events.id] }),
}));
