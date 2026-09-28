/**
 * Турнірна таблиця за правилами ALG (і такими ж в OMW):
 * 3:0 → 3 очки, 2:1 → 2, 1:2 → 1, 0:3 → 0; walkover: переможцю 3 (3:0), хто віддав — −1.
 * Порядок: очки → перемоги → співвідношення сетів → особиста зустріч → назва.
 */

export type MatchResult = {
  home: string;
  away: string;
  setsHome: number | null;
  setsAway: number | null;
  /** Хто віддав walkover. */
  walkover: "home" | "away" | null;
};

export type StandingRow = {
  team: string;
  played: number;
  won: number;
  lost: number;
  setsFor: number;
  setsAgainst: number;
  points: number;
  /** Скільки матчів команди ще не зіграно. */
  remaining: number;
};

export function normTeam(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/gi, "l")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

export function isPlayed(m: MatchResult): boolean {
  return m.walkover != null || (m.setsHome != null && m.setsAway != null);
}

function matchPoints(forSets: number, againstSets: number): number {
  if (forSets > againstSets) return againstSets === 0 ? 3 : 2;
  return forSets === 0 ? 0 : 1;
}

export function computeStandings(matches: MatchResult[]): StandingRow[] {
  const rows = new Map<string, StandingRow & { key: string }>();
  const row = (team: string) => {
    const key = normTeam(team);
    if (!rows.has(key)) {
      rows.set(key, { key, team, played: 0, won: 0, lost: 0, setsFor: 0, setsAgainst: 0, points: 0, remaining: 0 });
    }
    return rows.get(key)!;
  };

  for (const m of matches) {
    const h = row(m.home);
    const a = row(m.away);
    if (!isPlayed(m)) {
      h.remaining++;
      a.remaining++;
      continue;
    }
    h.played++;
    a.played++;
    if (m.walkover) {
      const [winner, loser] = m.walkover === "home" ? [a, h] : [h, a];
      winner.won++;
      winner.points += 3;
      winner.setsFor += 3;
      loser.lost++;
      loser.points -= 1;
      loser.setsAgainst += 3;
      continue;
    }
    const sh = m.setsHome!;
    const sa = m.setsAway!;
    h.setsFor += sh;
    h.setsAgainst += sa;
    a.setsFor += sa;
    a.setsAgainst += sh;
    h.points += matchPoints(sh, sa);
    a.points += matchPoints(sa, sh);
    if (sh > sa) {
      h.won++;
      a.lost++;
    } else {
      a.won++;
      h.lost++;
    }
  }

  const ratio = (r: StandingRow) => (r.setsAgainst === 0 ? (r.setsFor > 0 ? Infinity : 0) : r.setsFor / r.setsAgainst);
  const headToHead = (x: string, y: string) => {
    let px = 0;
    let py = 0;
    for (const m of matches) {
      if (!isPlayed(m) || m.walkover) continue;
      const hk = normTeam(m.home);
      const ak = normTeam(m.away);
      if (hk === x && ak === y) {
        px += matchPoints(m.setsHome!, m.setsAway!);
        py += matchPoints(m.setsAway!, m.setsHome!);
      } else if (hk === y && ak === x) {
        py += matchPoints(m.setsHome!, m.setsAway!);
        px += matchPoints(m.setsAway!, m.setsHome!);
      }
    }
    return py - px;
  };

  return [...rows.values()]
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.won - a.won ||
        ratio(b) - ratio(a) ||
        headToHead(a.key, b.key) ||
        a.team.localeCompare(b.team),
    )
    .map((r) => ({
      team: r.team,
      played: r.played,
      won: r.won,
      lost: r.lost,
      setsFor: r.setsFor,
      setsAgainst: r.setsAgainst,
      points: r.points,
      remaining: r.remaining,
    }));
}

export type PlayoffStatus = {
  position: number;
  points: number;
  spots: number;
  /** clinched — плей-оф гарантовано; eliminated — вже не наздогнати; in / out — зараз у зоні чи поза нею. */
  state: "clinched" | "eliminated" | "in" | "out";
  /** Для in: відрив від першої команди поза зоною; для out: відставання від останньої в зоні. */
  gap: number;
  remaining: number;
  /** Суперник у півфіналі, якби сезон закінчився зараз (1–4, 2–3). */
  semifinalOpponent: string | null;
};

export function playoffStatus(table: StandingRow[], ourName: string, spots: number): PlayoffStatus | null {
  const idx = table.findIndex((r) => normTeam(r.team) === normTeam(ourName));
  if (idx < 0 || spots <= 0) return null;
  const us = table[idx];
  const others = table.filter((_, i) => i !== idx);
  const maxOf = (r: StandingRow) => r.points + 3 * r.remaining;

  // Гарантовано, якщо навіть при наших нулях у кінці нас можуть наздогнати не більше spots-1 команд.
  const threats = others.filter((r) => maxOf(r) >= us.points).length;
  // Вилетіли, якщо вже spots команд мають більше, ніж ми можемо набрати максимум.
  const unreachable = others.filter((r) => r.points > maxOf(us)).length;

  const inZone = idx < spots;
  let state: PlayoffStatus["state"] = inZone ? "in" : "out";
  if (threats < spots) state = "clinched";
  else if (unreachable >= spots) state = "eliminated";

  const gap = inZone
    ? us.points - (table[spots]?.points ?? 0)
    : (table[spots - 1]?.points ?? 0) - us.points;

  let semifinalOpponent: string | null = null;
  if (inZone && spots === 4 && table.length >= 4) semifinalOpponent = table[3 - idx]?.team ?? null;

  return { position: idx + 1, points: us.points, spots, state, gap, remaining: us.remaining, semifinalOpponent };
}
