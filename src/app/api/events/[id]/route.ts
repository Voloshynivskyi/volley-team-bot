import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, getSettings, schema } from "@/db";
import { handle, idParam, json, parseBody } from "@/lib/api";
import { HttpError, requireAdmin, requireViewer } from "@/lib/auth";
import { getEventRow } from "@/lib/events";
import { refreshEventPosts } from "@/lib/telegram/post";
import { localInputToDate } from "@/lib/time";
import { eventPatch } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req: NextRequest, ctx) => {
  await requireViewer(req);
  const id = idParam((await ctx.params).id);
  const row = await getEventRow(id);
  if (!row) throw new HttpError(404, "Подію не знайдено");
  return json(row);
});

export const PATCH = handle<Ctx>(async (req: NextRequest, ctx) => {
  await requireAdmin(req);
  const id = idParam((await ctx.params).id);
  const { startsAtLocal, announceNow: _ignored, ...rest } = await parseBody(req, eventPatch);
  void _ignored;

  const patch: Partial<typeof schema.events.$inferInsert> = { ...rest, updatedAt: new Date() };
  if (startsAtLocal) {
    const settings = await getSettings();
    patch.startsAt = localInputToDate(startsAtLocal, settings.timezone);
  }
  if (rest.type === "training") Object.assign(patch, { opponent: null, competitionId: null, isHome: null, round: null });
  // Якщо записали рахунок — подія автоматично стає зіграною.
  if (rest.scoreUs != null && rest.scoreThem != null && !rest.status) patch.status = "finished";

  const [row] = await db.update(schema.events).set(patch).where(eq(schema.events.id, id)).returning();
  if (!row) throw new HttpError(404, "Подію не знайдено");

  // Повідомлення в треді мають показувати актуальні дату/місце/статус.
  await refreshEventPosts(id);
  return json(await getEventRow(id));
});

export const DELETE = handle<Ctx>(async (req: NextRequest, ctx) => {
  await requireAdmin(req);
  const id = idParam((await ctx.params).id);
  const [row] = await db.delete(schema.events).where(eq(schema.events.id, id)).returning();
  if (!row) throw new HttpError(404, "Подію не знайдено");
  return json({ ok: true });
});
