import { describe, expect, it } from "vitest";
import { computeStandings, normTeam, playoffStatus, type MatchResult } from "./standings";

const m = (home: string, away: string, sh: number | null, sa: number | null, walkover: "home" | "away" | null = null): MatchResult => ({
  home,
  away,
  setsHome: sh,
  setsAway: sa,
  walkover,
});

describe("computeStandings", () => {
  it("awards 3/2/1/0 like ALG and OMW", () => {
    const t = computeStandings([m("A", "B", 3, 0), m("C", "D", 2, 1), m("A", "C", 1, 2)]);
    const pts = Object.fromEntries(t.map((r) => [r.team, r.points]));
    // C виграв обидва матчі 2:1 → 2 + 2.
    expect(pts).toEqual({ A: 4, B: 0, C: 4, D: 1 });
  });

  it("walkover: winner 3 points and 3:0 sets, loser −1", () => {
    const t = computeStandings([m("A", "B", null, null, "away")]);
    const a = t.find((r) => r.team === "A")!;
    const b = t.find((r) => r.team === "B")!;
    expect([a.points, a.setsFor, a.won]).toEqual([3, 3, 1]);
    expect([b.points, b.setsAgainst, b.lost]).toEqual([-1, 3, 1]);
  });

  it("counts unplayed matches as remaining", () => {
    const t = computeStandings([m("A", "B", 3, 0), m("A", "C", null, null)]);
    expect(t.find((r) => r.team === "A")!.remaining).toBe(1);
    expect(t.find((r) => r.team === "C")!.played).toBe(0);
  });

  it("ties break on wins, then set ratio", () => {
    // A: 2:1 + 2:1 = 4 pts, 2 wins. B: 3:0 + 1:2 = 4 pts, 1 win → A above B.
    const t = computeStandings([m("A", "X", 2, 1), m("A", "Y", 2, 1), m("B", "X", 3, 0), m("B", "Y", 1, 2)]);
    expect(t.map((r) => r.team).indexOf("A")).toBeLessThan(t.map((r) => r.team).indexOf("B"));
  });

  it("treats spelling variants as one team", () => {
    expect(normTeam("NETPANDAS")).toBe(normTeam("Netpandas"));
    expect(normTeam("SKY Volley Wrocław")).toBe(normTeam("sky volley wroclaw"));
    const t = computeStandings([m("NETPANDAS", "A", 3, 0), m("Netpandas", "B", 3, 0)]);
    expect(t.filter((r) => normTeam(r.team) === "netpandas")).toHaveLength(1);
  });
});

describe("playoffStatus", () => {
  const teams = ["US", "B", "C", "D", "E", "F"];
  it("early season: in zone but not clinched", () => {
    // Коло з 6 команд, зіграно лише перший тур — усім лишається по 4 матчі.
    const all: MatchResult[] = [];
    for (let i = 0; i < teams.length; i++)
      for (let j = i + 1; j < teams.length; j++) all.push(m(teams[i], teams[j], null, null));
    const firstRound: Record<string, [number, number]> = { "US-B": [3, 0], "C-D": [2, 1], "E-F": [1, 2] };
    const played = all.map((x) => {
      const r = firstRound[`${x.home}-${x.away}`];
      return r ? m(x.home, x.away, r[0], r[1]) : x;
    });
    const s = playoffStatus(computeStandings(played), "US", 4)!;
    expect(s.position).toBe(1);
    expect(s.state).toBe("in");
    expect(s.remaining).toBe(4);
    expect(s.semifinalOpponent).not.toBeNull();
  });

  it("clinched is real math: nobody else can catch up", () => {
    // Решта команд уже зіграли все, наздогнати US може лише C.
    const t = computeStandings([m("US", "B", 3, 0), m("C", "D", 3, 0), m("E", "F", 2, 1), m("US", "C", null, null)]);
    expect(playoffStatus(t, "US", 4)!.state).toBe("clinched");
  });

  it("clinched when fewer than `spots` teams can still reach us", () => {
    // Усі матчі зіграні, крім одного між двома аутсайдерами.
    const played: MatchResult[] = [];
    for (let i = 0; i < teams.length; i++)
      for (let j = i + 1; j < teams.length; j++) {
        const [h, a] = [teams[i], teams[j]];
        if (h === "E" && a === "F") played.push(m(h, a, null, null));
        else played.push(m(h, a, i < j ? 3 : 0, i < j ? 0 : 3));
      }
    const t = computeStandings(played);
    expect(playoffStatus(t, "US", 4)!.state).toBe("clinched");
    expect(playoffStatus(t, "F", 4)!.state).toBe("eliminated");
  });

  it("returns null for unknown team", () => {
    expect(playoffStatus(computeStandings([m("A", "B", 3, 0)]), "Nope", 4)).toBeNull();
  });
});
