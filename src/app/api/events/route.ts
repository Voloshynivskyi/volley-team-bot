import { db, getSettings, schema } from "@/db";
import { handle, json, parseBody } from "@/lib/api";
import { actorOf, audit } from "@/lib/audit";
import { requireAdmin, requireViewer } from "@/lib/auth";
import { getEventRow, listEvents } from "@/lib/events";
import { sendEventPost } from "@/lib/telegram/post";
import { localInputToDate } from "@/lib/time";
import { eventInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  await requireViewer(req);
  const scope = req.nextUrl.searchParams.get("scope") === "past" ? "past" : "upcoming";
  return json(await listEvents(scope));
});

export const POST = handle(async (req) => {
  const viewer = await requireAdmin(req);
  const { startsAtLocal, announceNow, ...rest } = await parseBody(req, eventInput);
  const settings = await getSettings();
  const values = {
    ...rest,
    startsAt: localInputToDate(startsAtLocal, settings.timezone),
    // У тренування немає суперника й ліги, навіть якщо форма їх надіслала.
    ...(rest.type === "training" ? { opponent: null, competitionId: null, isHome: null, round: null } : {}),
  };
  const [created] = await db.insert(schema.events).values(values).returning();
  await audit("event", created.id, "create", actorOf(viewer.user), null, created);

  let announced: string | null = null;
  if (announceNow) announced = await sendEventPost(created.id, "announce");

  return json({ ...(await getEventRow(created.id)), announced }, 201);
});
