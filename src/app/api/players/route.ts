import { db, schema } from "@/db";
import { handle, json, parseBody } from "@/lib/api";
import { requireAdmin, requireViewer } from "@/lib/auth";
import { listPlayers } from "@/lib/events";
import { playerInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  await requireViewer(req);
  return json(await listPlayers());
});

export const POST = handle(async (req) => {
  await requireAdmin(req);
  const input = await parseBody(req, playerInput);
  const [row] = await db.insert(schema.players).values(input).returning();
  return json(row, 201);
});
