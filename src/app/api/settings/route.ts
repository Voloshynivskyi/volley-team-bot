import { eq } from "drizzle-orm";
import { db, getSettings, schema } from "@/db";
import { handle, json, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { settingsInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  await requireAdmin(req);
  return json(await getSettings());
});

export const PATCH = handle(async (req) => {
  await requireAdmin(req);
  const input = await parseBody(req, settingsInput.partial());
  await getSettings();
  const [row] = await db
    .update(schema.settings)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(schema.settings.id, 1))
    .returning();
  return json(row);
});

/** Відв'язати групу. */
export const DELETE = handle(async (req) => {
  await requireAdmin(req);
  await getSettings();
  const [row] = await db
    .update(schema.settings)
    .set({ chatId: null, threadId: null, chatTitle: null, updatedAt: new Date() })
    .where(eq(schema.settings.id, 1))
    .returning();
  return json(row);
});
