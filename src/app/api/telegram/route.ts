import { webhookCallback } from "grammy";
import { bot } from "@/lib/telegram/bot";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const handler = webhookCallback(bot, "std/http", {
  secretToken: env.WEBHOOK_SECRET || undefined,
  timeoutMilliseconds: 25_000,
});

export async function POST(req: Request) {
  return handler(req);
}
