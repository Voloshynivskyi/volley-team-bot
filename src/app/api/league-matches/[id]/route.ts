import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { handle, idParam, json, parseBody } from "@/lib/api";
import { actorOf, audit } from "@/lib/audit";
import { HttpError, requireAdmin } from "@/lib/auth";
import { applyResult, syncLeagueMatch } from "@/lib/results";
import { normTeam } from "@/lib/standings";
import { refreshEventPosts } from "@/lib/telegram/post";
import { leagueMatchPatch } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Адмін вносить результат матчу ліги. Наш матч іде через картку гри, щоб спрацювали тред і MVP. */
export const PATCH = handle<Ctx>(async (req: NextRequest, ctx) => {
  const viewer = await requireAdmin(req);
  const actor = actorOf(viewer.user);
  const id = idParam((await ctx.params).id);
  const input = await parseBody(req, leagueMatchPatch);

  const match = await db.query.leagueMatches.findFirst({ where: eq(schema.leagueMatches.id, id) });
  if (!match) throw new HttpError(404, "eventNotFound");

  if (match.eventId) {
    const comp = await db.query.competitions.findFirst({ where: eq(schema.competitions.id, match.competitionId) });
    const weAreHome = comp?.ourName ? normTeam(match.home) === normTeam(comp.ourName) : true;
    if (input.setsHome != null && input.setsAway != null) {
      const [us, them] = weAreHome ? [input.setsHome, input.setsAway] : [input.setsAway, input.setsHome];
      await applyResult(match.eventId, us, them, actor);
    } else {
      // Прибрати результат нашої гри — вона знову "запланована".
      const before = await db.query.events.findFirst({ where: eq(schema.events.id, match.eventId) });
      const [after] = await db
        .update(schema.events)
        .set({ scoreUs: null, scoreThem: null, status: "scheduled", updatedAt: new Date() })
        .where(eq(schema.events.id, match.eventId))
        .returning();
      await audit("event", match.eventId, "result", actor, before, after);
      await syncLeagueMatch(match.eventId);
      await refreshEventPosts(match.eventId);
    }
  } else {
    const [row] = await db
      .update(schema.leagueMatches)
      .set({
        setsHome: input.walkover ? null : input.setsHome,
        setsAway: input.walkover ? null : input.setsAway,
        walkover: input.walkover,
      })
      .where(eq(schema.leagueMatches.id, id))
      .returning();
    await audit("match", id, "result", actor, match, row);
  }

  return json(await db.query.leagueMatches.findFirst({ where: eq(schema.leagueMatches.id, id) }));
});
