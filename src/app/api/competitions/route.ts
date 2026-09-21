import { db, schema } from "@/db";
import { handle, json, parseBody } from "@/lib/api";
import { requireAdmin, requireViewer } from "@/lib/auth";
import { listCompetitions } from "@/lib/events";
import { competitionInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  await requireViewer(req);
  const all = req.nextUrl.searchParams.get("all") === "1";
  return json(await listCompetitions(all));
});

export const POST = handle(async (req) => {
  await requireAdmin(req);
  const input = await parseBody(req, competitionInput);
  const [row] = await db.insert(schema.competitions).values(input).returning();
  return json(row, 201);
});
