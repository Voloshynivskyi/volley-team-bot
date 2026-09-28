import { and, eq, ne } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { handle, idParam, json, parseBody } from "@/lib/api";
import { HttpError, requireAdmin, requireMember } from "@/lib/auth";
import { mergeAttendanceForPlayer, syncAttendanceName } from "@/lib/events";
import { refreshEventPosts } from "@/lib/telegram/post";
import { playerPatch } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const { players } = schema;

/** Редагувати картки може будь-хто з групи команди, щоб кожен міг сам вписати свої дані. */
export const PATCH = handle<Ctx>(async (req: NextRequest, ctx) => {
  const viewer = await requireMember(req);
  const id = idParam((await ctx.params).id);
  const { linkMe, ...input } = await parseBody(req, playerPatch);

  const current = await db.query.players.findFirst({ where: eq(players.id, id) });
  if (!current) throw new HttpError(404, "playerNotFound");

  const patch: Partial<typeof players.$inferInsert> = { ...input, updatedAt: new Date() };
  if (linkMe && current.telegramUserId !== viewer.user.id) {
    if (current.telegramUserId != null) throw new HttpError(409, "linkedToOther");
    const other = await db.query.players.findFirst({
      where: and(eq(players.telegramUserId, viewer.user.id), ne(players.id, id)),
    });
    if (other) throw new HttpError(409, "alreadyLinked");
    patch.telegramUserId = viewer.user.id;
    if (viewer.user.username) patch.telegramUsername = viewer.user.username;
  }

  const [row] = await db.update(players).set(patch).where(eq(players.id, id)).returning();

  // Явку й повідомлення в треді оновлюємо, лише якщо змінилось те, що в них видно.
  const touched = new Set<number>();
  if (patch.telegramUserId != null) {
    for (const e of await mergeAttendanceForPlayer(id, patch.telegramUserId, row.fullName)) touched.add(e);
  }
  if (row.fullName !== current.fullName) {
    for (const e of await syncAttendanceName(id, row.fullName)) touched.add(e);
  }
  await Promise.all([...touched].map((e) => refreshEventPosts(e)));

  return json(row);
});

export const DELETE = handle<Ctx>(async (req: NextRequest, ctx) => {
  await requireAdmin(req);
  const id = idParam((await ctx.params).id);
  const [row] = await db.delete(players).where(eq(players.id, id)).returning();
  if (!row) throw new HttpError(404, "playerNotFound");
  return json({ ok: true });
});
