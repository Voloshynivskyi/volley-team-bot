import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Competition, LeagueMatch } from "@/db/schema";
import { fetchOmwTable, isOmwTableUrl } from "@/lib/omw";
import {
  computeStandings,
  normTeam,
  playoffStatus,
  type PlayoffStatus,
  type StandingRow,
} from "@/lib/standings";

export type StandingsView = {
  competition: Pick<Competition, "id" | "name" | "shortName" | "standingsUrl">;
  mode: "computed" | "external";
  rows: (StandingRow & { isUs: boolean })[];
  spots: number | null;
  status: PlayoffStatus | null;
  us: StandingRow | null;
  matches: (LeagueMatch & { isOurs: boolean })[];
  error?: "external_failed";
};

function mark(rows: StandingRow[], ourName: string | null) {
  const key = ourName ? normTeam(ourName) : null;
  return rows.map((r) => ({ ...r, isUs: key != null && normTeam(r.team) === key }));
}

/** Таблиці всіх активних ліг: власна (з матчів ліги) або з сайту OMW. */
export async function standingsViews(): Promise<StandingsView[]> {
  const comps = await db.query.competitions.findMany({
    where: eq(schema.competitions.isArchived, false),
    orderBy: [asc(schema.competitions.id)],
  });
  const views: StandingsView[] = [];

  for (const c of comps) {
    const base = { competition: { id: c.id, name: c.name, shortName: c.shortName, standingsUrl: c.standingsUrl } };
    const matches = await db.query.leagueMatches.findMany({
      where: eq(schema.leagueMatches.competitionId, c.id),
      orderBy: [asc(schema.leagueMatches.round), asc(schema.leagueMatches.matchNo)],
    });

    if (matches.length) {
      const table = computeStandings(
        matches.map((m) => ({
          home: m.home,
          away: m.away,
          setsHome: m.setsHome,
          setsAway: m.setsAway,
          walkover: m.walkover === "home" || m.walkover === "away" ? m.walkover : null,
        })),
      );
      const rows = mark(table, c.ourName);
      const ourKey = c.ourName ? normTeam(c.ourName) : null;
      views.push({
        ...base,
        mode: "computed",
        rows,
        spots: c.playoffSpots,
        status: c.ourName && c.playoffSpots ? playoffStatus(table, c.ourName, c.playoffSpots) : null,
        us: rows.find((r) => r.isUs) ?? null,
        matches: matches.map((m) => ({
          ...m,
          isOurs: ourKey != null && (normTeam(m.home) === ourKey || normTeam(m.away) === ourKey),
        })),
      });
      continue;
    }

    if (isOmwTableUrl(c.standingsUrl)) {
      try {
        const rows = mark(await fetchOmwTable(c.standingsUrl), c.ourName);
        views.push({ ...base, mode: "external", rows, spots: null, status: null, us: rows.find((r) => r.isUs) ?? null, matches: [] });
      } catch (err) {
        console.warn("OMW table fetch failed", err);
        views.push({ ...base, mode: "external", rows: [], spots: null, status: null, us: null, matches: [], error: "external_failed" });
      }
    }
  }
  return views;
}
