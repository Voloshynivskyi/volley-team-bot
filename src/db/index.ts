import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as tables from "./schema";
import * as relations from "./relations";
import { env } from "@/lib/env";

export const schema = tables;
const sql = neon(env.DATABASE_URL);
export const db = drizzle({ client: sql, schema: { ...tables, ...relations } });

export async function getSettings(): Promise<tables.Settings> {
  const [row] = await db.select().from(tables.settings).where(eq(tables.settings.id, 1));
  if (row) return row;
  const [created] = await db.insert(tables.settings).values({ id: 1 }).returning();
  return created;
}
