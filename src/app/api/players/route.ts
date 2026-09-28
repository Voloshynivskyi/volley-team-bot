import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handle, json, parseBody } from "@/lib/api";
import { HttpError, requireMember, requireViewer } from "@/lib/auth";
import { listPlayers, mergeAttendanceForPlayer } from "@/lib/events";
import { refreshEventPosts } from "@/lib/telegram/post";
import { playerInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  await requireViewer(req);
  return json(await listPlayers());
});

/** Додати гравця може будь-хто з групи команди — наприклад, себе. */
export const POST = handle(async (req) => {
  const viewer = await requireMember(req);
  const { linkMe, ...input } = await parseBody(req, playerInput);

  if (linkMe) {
    const mine = await db.query.players.findFirst({ where: eq(schema.players.telegramUserId, viewer.user.id) });
    if (mine) throw new HttpError(409, "alreadyLinked");
  }

  const [row] = await db
    .insert(schema.players)
    .values({
      ...input,
      ...(linkMe
        ? { telegramUserId: viewer.user.id, telegramUsername: viewer.user.username ?? input.telegramUsername ?? null }
        : {}),
    })
    .returning();

  if (linkMe) {
    const touched = await mergeAttendanceForPlayer(row.id, viewer.user.id, row.fullName);
    await Promise.all(touched.map((id) => refreshEventPosts(id)));
  }
  return json(row, 201);
});
