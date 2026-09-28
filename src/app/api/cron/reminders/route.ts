import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { json } from "@/lib/api";
import { notifyOwner } from "@/lib/notify";
import { runCron } from "@/lib/telegram/post";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const given =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.nextUrl.searchParams.get("secret") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(req: NextRequest) {
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);
  try {
    const result = await runCron();
    // 500 при частковому збої — щоб cron-job.org теж помітив і надіслав лист.
    return json({ ok: result.errors.length === 0, at: new Date().toISOString(), ...result }, result.errors.length ? 500 : 200);
  } catch (err) {
    console.error("cron failed", err);
    await notifyOwner("cron", err);
    return json({ ok: false, error: String(err) }, 500);
  }
}

export const GET = run;
export const POST = run;
