import { handle, json } from "@/lib/api";
import { listAudit, type Entity } from "@/lib/audit";
import { requireAdmin, requireMember } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ENTITIES: Entity[] = ["player", "event", "competition", "settings", "match"];

/**
 * Історія картки гравця бачать усі учасники групи (вони ж її й редагують);
 * повний журнал — лише адміни.
 */
export const GET = handle(async (req) => {
  const q = req.nextUrl.searchParams;
  const entity = ENTITIES.find((e) => e === q.get("entity"));
  const entityId = Number(q.get("id")) || undefined;
  if (entity === "player" && entityId) await requireMember(req);
  else await requireAdmin(req);
  return json(await listAudit({ entity, entityId, limit: Number(q.get("limit")) || 50 }));
});
