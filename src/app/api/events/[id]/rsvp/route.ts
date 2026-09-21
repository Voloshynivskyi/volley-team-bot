import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { handle, idParam, json, parseBody } from "@/lib/api";
import { HttpError, requireViewer } from "@/lib/auth";
import { getEventRow, setRsvp } from "@/lib/events";
import { refreshEventPosts } from "@/lib/telegram/post";
import { rsvpInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (req: NextRequest, ctx) => {
  const viewer = await requireViewer(req);
  const id = idParam((await ctx.params).id);
  const { status } = await parseBody(req, rsvpInput);

  const event = await db.query.events.findFirst({ where: eq(schema.events.id, id) });
  if (!event) throw new HttpError(404, "Подію не знайдено");
  if (event.status !== "scheduled") throw new HttpError(400, "Ця подія вже неактуальна");

  await setRsvp(id, viewer.user, status);
  await refreshEventPosts(id);
  return json(await getEventRow(id));
});
