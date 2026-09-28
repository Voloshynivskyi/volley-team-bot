import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, getSettings, schema } from "@/db";
import { handle, idParam, json, parseBody } from "@/lib/api";
import { actorOf, audit } from "@/lib/audit";
import { HttpError, requireAdmin, requireViewer } from "@/lib/auth";
import { getEventRow } from "@/lib/events";
import { mvpSummary } from "@/lib/mvp";
import { applyResult, syncLeagueMatch } from "@/lib/results";
import { refreshEventPosts } from "@/lib/telegram/post";
import { localInputToDate } from "@/lib/time";
import { eventPatch } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req: NextRequest, ctx) => {
  await requireViewer(req);
  const id = idParam((await ctx.params).id);
  const row = await getEventRow(id);
  if (!row) throw new HttpError(404, "eventNotFound");
  return json({ ...row, mvp: await mvpSummary(id) });
});

export const PATCH = handle<Ctx>(async (req: NextRequest, ctx) => {
  const viewer = await requireAdmin(req);
  const actor = actorOf(viewer.user);
  const id = idParam((await ctx.params).id);
  const { startsAtLocal, announceNow: _ignored, scoreUs, scoreThem, ...rest } = await parseBody(req, eventPatch);
  void _ignored;

  const before = await db.query.events.findFirst({ where: eq(schema.events.id, id) });
  if (!before) throw new HttpError(404, "eventNotFound");

  const patch: Partial<typeof schema.events.$inferInsert> = { ...rest, updatedAt: new Date() };
  if (startsAtLocal) {
    const settings = await getSettings();
    patch.startsAt = localInputToDate(startsAtLocal, settings.timezone);
  }
  if (rest.type === "training") Object.assign(patch, { opponent: null, competitionId: null, isHome: null, round: null });

  const [row] = await db.update(schema.events).set(patch).where(eq(schema.events.id, id)).returning();
  await audit("event", id, "update", actor, before, row);

  if (scoreUs != null && scoreThem != null) {
    // Рахунок — через одне місце: таблиця ліги, тред, MVP.
    await applyResult(id, scoreUs, scoreThem, actor);
  } else {
    if (rest.status && rest.status !== "finished") await syncLeagueMatch(id);
    // Повідомлення в треді мають показувати актуальні дату/місце/статус.
    await refreshEventPosts(id);
  }
  return json(await getEventRow(id));
});

export const DELETE = handle<Ctx>(async (req: NextRequest, ctx) => {
  const viewer = await requireAdmin(req);
  const id = idParam((await ctx.params).id);
  const [row] = await db.delete(schema.events).where(eq(schema.events.id, id)).returning();
  if (!row) throw new HttpError(404, "eventNotFound");
  await audit("event", id, "delete", actorOf(viewer.user), row, null);
  return json({ ok: true });
});
