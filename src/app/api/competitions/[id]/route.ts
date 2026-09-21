import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { handle, idParam, json, parseBody } from "@/lib/api";
import { HttpError, requireAdmin } from "@/lib/auth";
import { competitionPatch } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle<Ctx>(async (req: NextRequest, ctx) => {
  await requireAdmin(req);
  const id = idParam((await ctx.params).id);
  const input = await parseBody(req, competitionPatch);
  const [row] = await db.update(schema.competitions).set(input).where(eq(schema.competitions.id, id)).returning();
  if (!row) throw new HttpError(404, "Лігу не знайдено");
  return json(row);
});

export const DELETE = handle<Ctx>(async (req: NextRequest, ctx) => {
  await requireAdmin(req);
  const id = idParam((await ctx.params).id);
  // Події лишаються, у них просто зникає ліга (FK on delete set null).
  const [row] = await db.delete(schema.competitions).where(eq(schema.competitions.id, id)).returning();
  if (!row) throw new HttpError(404, "Лігу не знайдено");
  return json({ ok: true });
});
