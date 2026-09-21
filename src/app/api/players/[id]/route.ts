import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { handle, idParam, json, parseBody } from "@/lib/api";
import { HttpError, requireAdmin } from "@/lib/auth";
import { playerPatch } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle<Ctx>(async (req: NextRequest, ctx) => {
  await requireAdmin(req);
  const id = idParam((await ctx.params).id);
  const input = await parseBody(req, playerPatch);
  const [row] = await db
    .update(schema.players)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(schema.players.id, id))
    .returning();
  if (!row) throw new HttpError(404, "Гравця не знайдено");
  return json(row);
});

export const DELETE = handle<Ctx>(async (req: NextRequest, ctx) => {
  await requireAdmin(req);
  const id = idParam((await ctx.params).id);
  const [row] = await db.delete(schema.players).where(eq(schema.players.id, id)).returning();
  if (!row) throw new HttpError(404, "Гравця не знайдено");
  return json({ ok: true });
});
