import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getSettings } from "@/db";
import { buildTeamCalendar } from "@/lib/calendar";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ file: string }> };

/**
 * Підписка на календар: /cal/<token>.ics
 * Календарні застосунки не вміють авторизуватись, тож доступ — за секретом у посиланні.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { file } = await ctx.params;
  const token = file.replace(/\.ics$/i, "");
  const s = await getSettings();
  const a = Buffer.from(token);
  const b = Buffer.from(s.calendarToken ?? "");
  if (!s.calendarToken || a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(await buildTeamCalendar(), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="team.ics"',
      "cache-control": "public, max-age=900",
    },
  });
}
