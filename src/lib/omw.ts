import type { StandingRow } from "./standings";

/**
 * Таблиця з сайту OMW (siatkowka.omw.wroc.pl/.../tabela).
 * Колонки: № | (лого) | Team | Rozegrane | Wygrane | Przegrane | Sety "13 - 2" | Punkty
 */
export function parseOmwTable(html: string): StandingRow[] {
  const clean = (s: string) =>
    s
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#0?39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const table = body.split(/<table/i)[1]?.split(/<\/table>/i)[0];
  if (!table) return [];

  const rows: StandingRow[] = [];
  for (const tr of table.split(/<tr[^>]*>/i).slice(1)) {
    const cells = tr
      .split(/<t[dh][^>]*>/i)
      .slice(1)
      .map((c) => clean(c.split(/<\/t[dh]>/i)[0]));
    if (cells.length < 8 || !/^\d+$/.test(cells[0])) continue;
    const [, , team, played, won, lost, sets, points] = cells;
    const m = sets.match(/(\d+)\s*-\s*(\d+)/);
    rows.push({
      team,
      played: Number(played),
      won: Number(won),
      lost: Number(lost),
      setsFor: m ? Number(m[1]) : 0,
      setsAgainst: m ? Number(m[2]) : 0,
      points: Number(points),
      remaining: 0,
    });
  }
  return rows;
}

let cache: { url: string; rows: StandingRow[]; at: number } | null = null;
const TTL_MS = 30 * 60_000;

export async function fetchOmwTable(url: string): Promise<StandingRow[]> {
  if (cache && cache.url === url && Date.now() - cache.at < TTL_MS) return cache.rows;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (volley-team-bot)" }, cache: "no-store" });
  if (!res.ok) throw new Error(`OMW ${res.status}`);
  const rows = parseOmwTable(await res.text());
  if (rows.length) cache = { url, rows, at: Date.now() };
  return rows;
}

export function isOmwTableUrl(url: string | null | undefined): url is string {
  return !!url && /siatkowka\.omw\.wroc\.pl\/.+\/tabela/i.test(url);
}
