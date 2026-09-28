import { describe, expect, it } from "vitest";
import { checkLineup, DEFAULT_LINEUP_RULES, nonResponders, parseLineupRules } from "./lineup";

type P = { id: number; position: "setter" | "outside" | "middle" | "opposite" | "libero" | "universal" | null; status: "active" | "reserve" | "injured"; telegramUserId: number | null };

const roster: P[] = [
  { id: 1, position: "setter", status: "active", telegramUserId: 100 },
  { id: 2, position: "outside", status: "active", telegramUserId: 101 },
  { id: 3, position: "outside", status: "active", telegramUserId: null },
  { id: 4, position: "middle", status: "active", telegramUserId: null },
  { id: 5, position: "middle", status: "active", telegramUserId: null },
  { id: 6, position: "opposite", status: "active", telegramUserId: null },
  { id: 7, position: "libero", status: "active", telegramUserId: null },
  { id: 8, position: "universal", status: "active", telegramUserId: null },
  { id: 9, position: "outside", status: "injured", telegramUserId: null },
];
const going = (ids: number[]) => ids.map((playerId) => ({ status: "going" as const, playerId }));

describe("checkLineup", () => {
  it("full lineup is ok", () => {
    const c = checkLineup(DEFAULT_LINEUP_RULES, going([1, 2, 3, 4, 5, 6, 7]), roster);
    expect(c.ok).toBe(true);
    expect(c.going).toBe(7);
    expect(c.gaps).toEqual([]);
  });

  it("reports missing players and positions", () => {
    const c = checkLineup(DEFAULT_LINEUP_RULES, going([2, 4, 5]), roster);
    expect(c.ok).toBe(false);
    expect(c.missingPlayers).toBe(3);
    expect(c.gaps.map((g) => g.position)).toEqual(["setter", "outside", "opposite", "libero"]);
  });

  it("universal fills the first gap", () => {
    const c = checkLineup(DEFAULT_LINEUP_RULES, going([2, 3, 4, 5, 6, 7, 8]), roster);
    expect(c.gaps).toEqual([]);
    expect(c.universalsUsed).toBe(1);
    expect(c.ok).toBe(true);
  });

  it("maybe does not count, unknown people count only to total", () => {
    const c = checkLineup(
      DEFAULT_LINEUP_RULES,
      [...going([1, 2, 3, 4, 5, 6]), { status: "maybe", playerId: 7 }, { status: "going", playerId: null }],
      roster,
    );
    expect(c.going).toBe(7);
    expect(c.maybe).toBe(1);
    expect(c.gaps.map((g) => g.position)).toEqual(["libero"]);
  });

  it("flags more than max players", () => {
    const rules = { ...DEFAULT_LINEUP_RULES, maxPlayers: 3 };
    expect(checkLineup(rules, going([1, 2, 3, 4]), roster).tooMany).toBe(true);
  });
});

describe("parseLineupRules", () => {
  it("falls back to defaults on garbage", () => {
    expect(parseLineupRules("{oops")).toEqual(DEFAULT_LINEUP_RULES);
    expect(parseLineupRules(null)).toEqual(DEFAULT_LINEUP_RULES);
  });
  it("keeps valid overrides and fixes max < min", () => {
    const r = parseLineupRules(JSON.stringify({ minPlayers: 7, positions: { libero: { min: 2, max: 1 } } }));
    expect(r.minPlayers).toBe(7);
    expect(r.positions.libero).toEqual({ min: 2, max: 2 });
    expect(r.positions.setter).toEqual(DEFAULT_LINEUP_RULES.positions.setter);
  });
});

describe("nonResponders", () => {
  it("skips injured and anyone who answered by player or telegram id", () => {
    const att = [
      { playerId: 1, telegramUserId: 100 },
      { playerId: null, telegramUserId: 101 },
      { playerId: 4, telegramUserId: null },
    ];
    expect(nonResponders(att, roster).map((p) => p.id)).toEqual([3, 5, 6, 7, 8]);
  });
});
