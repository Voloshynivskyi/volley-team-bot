import { eq } from "drizzle-orm";
import { db, getSettings, schema } from "@/db";
import { handle, json, parseBody } from "@/lib/api";
import { actorOf, audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { settingsInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  await requireAdmin(req);
  return json(await getSettings());
});

export const PATCH = handle(async (req) => {
  const viewer = await requireAdmin(req);
  const { lineupRules, ...input } = await parseBody(req, settingsInput.partial());
  const before = await getSettings();
  const [row] = await db
    .update(schema.settings)
    .set({
      ...input,
      ...(lineupRules ? { lineupRules: JSON.stringify(lineupRules) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.settings.id, 1))
    .returning();
  await audit("settings", 1, "update", actorOf(viewer.user), before, row);
  return json(row);
});

/** Відв'язати групу. */
export const DELETE = handle(async (req) => {
  const viewer = await requireAdmin(req);
  const before = await getSettings();
  const [row] = await db
    .update(schema.settings)
    .set({ chatId: null, threadId: null, chatTitle: null, updatedAt: new Date() })
    .where(eq(schema.settings.id, 1))
    .returning();
  await audit("settings", 1, "update", actorOf(viewer.user), before, row);
  return json(row);
});
