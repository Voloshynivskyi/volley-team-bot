import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { handle, idParam, json, parseBody } from "@/lib/api";
import { HttpError, requireAdmin } from "@/lib/auth";
import { getEventRow, setPlayerRsvp } from "@/lib/events";
import { refreshEventPosts } from "@/lib/telegram/post";
import { playerRsvpInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Адмін відмічає явку за гравця зі складу (зокрема не прив'язаного до Telegram). */
export const POST = handle<Ctx>(async (req: NextRequest, ctx) => {
  await requireAdmin(req);
  const id = idParam((await ctx.params).id);
  const { playerId, status } = await parseBody(req, playerRsvpInput);

  const event = await db.query.events.findFirst({ where: eq(schema.events.id, id) });
  if (!event) throw new HttpError(404, "eventNotFound");

  try {
    await setPlayerRsvp(id, playerId, status);
  } catch (err) {
    if (err instanceof Error && err.message === "PLAYER_NOT_FOUND") throw new HttpError(404, "playerNotFound");
    throw err;
  }
  await refreshEventPosts(id);
  return json(await getEventRow(id));
});
