import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AuditEntry } from "@/db/schema";
import type { TelegramUser } from "@/lib/telegram/initData";

export type Entity = "player" | "event" | "competition" | "settings" | "match";
export type Action = "create" | "update" | "delete" | "link" | "result";
export type Actor = { id: number | null; name: string };

const IGNORED = new Set(["id", "createdAt", "updatedAt", "calendarToken", "lastDigestWeek", "lastBackupWeek"]);

export function actorOf(u: TelegramUser | null | undefined): Actor {
  if (!u) return { id: null, name: "bot" };
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || (u.username ? `@${u.username}` : `id${u.id}`);
  return { id: u.id, name };
}

function norm(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (v === undefined || v === "") return null;
  return v;
}

/** Які поля змінились між двома знімками запису. */
export function diffRecords(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of keys) {
    if (IGNORED.has(k)) continue;
    const from = norm(before?.[k]);
    const to = norm(after?.[k]);
    if (JSON.stringify(from) !== JSON.stringify(to)) out[k] = { from, to };
  }
  return out;
}

/** Записує подію в журнал. Помилка журналу ніколи не ламає основну дію. */
export async function audit(
  entity: Entity,
  entityId: number | null,
  action: Action,
  actor: Actor,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
): Promise<void> {
  try {
    const changes = diffRecords(before, after);
    if (action === "update" && !Object.keys(changes).length) return;
    await db.insert(schema.auditLog).values({
      entity,
      entityId,
      action,
      actorId: actor.id,
      actorName: actor.name,
      changes: Object.keys(changes).length ? changes : null,
    });
  } catch (err) {
    console.error("audit failed", err);
  }
}

export async function listAudit(opts: { entity?: Entity; entityId?: number; limit?: number }): Promise<AuditEntry[]> {
  const where = [
    opts.entity ? eq(schema.auditLog.entity, opts.entity) : undefined,
    opts.entityId != null ? eq(schema.auditLog.entityId, opts.entityId) : undefined,
  ].filter((x) => x !== undefined);
  return db.query.auditLog.findMany({
    where: where.length ? and(...where) : undefined,
    orderBy: [desc(schema.auditLog.createdAt)],
    limit: Math.min(opts.limit ?? 50, 200),
  });
}
