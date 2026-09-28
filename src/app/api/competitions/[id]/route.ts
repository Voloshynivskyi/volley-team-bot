import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { handle, idParam, json, parseBody } from "@/lib/api";
import { actorOf, audit } from "@/lib/audit";
import { HttpError, requireAdmin } from "@/lib/auth";
import { competitionPatch } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle<Ctx>(async (req: NextRequest, ctx) => {
  const viewer = await requireAdmin(req);
  const id = idParam((await ctx.params).id);
  const input = await parseBody(req, competitionPatch);
  const before = await db.query.competitions.findFirst({ where: eq(schema.competitions.id, id) });
  if (!before) throw new HttpError(404, "competitionNotFound");
  const [row] = await db.update(schema.competitions).set(input).where(eq(schema.competitions.id, id)).returning();
  await audit("competition", id, "update", actorOf(viewer.user), before, row);
  return json(row);
});

export const DELETE = handle<Ctx>(async (req: NextRequest, ctx) => {
  const viewer = await requireAdmin(req);
  const id = idParam((await ctx.params).id);
  // Події лишаються, у них просто зникає ліга (FK on delete set null).
  const [row] = await db.delete(schema.competitions).where(eq(schema.competitions.id, id)).returning();
  if (!row) throw new HttpError(404, "competitionNotFound");
  await audit("competition", id, "delete", actorOf(viewer.user), row, null);
  return json({ ok: true });
});
