import type { PlayerStatus, Position, RsvpStatus } from "@/db/schema";

/** Позиції, які мають покриватись на кожній грі. Універсал закриває будь-яку діру. */
export const LINEUP_POSITIONS = ["setter", "outside", "middle", "opposite", "libero"] as const;
export type LineupPosition = (typeof LINEUP_POSITIONS)[number];

export type LineupRules = {
  minPlayers: number;
  maxPlayers: number;
  positions: Record<LineupPosition, { min: number; max: number }>;
};

/** Як у таблиці команди: догравальники 2–3, діагональні 1–2, зв'язуючі 1–2, ліберо 1, центральні 2–3. */
export const DEFAULT_LINEUP_RULES: LineupRules = {
  minPlayers: 6,
  maxPlayers: 14,
  positions: {
    setter: { min: 1, max: 2 },
    outside: { min: 2, max: 3 },
    middle: { min: 2, max: 3 },
    opposite: { min: 1, max: 2 },
    libero: { min: 1, max: 1 },
  },
};

export function parseLineupRules(raw: string | null | undefined): LineupRules {
  if (!raw) return DEFAULT_LINEUP_RULES;
  try {
    const v = JSON.parse(raw) as Partial<LineupRules>;
    const positions = { ...DEFAULT_LINEUP_RULES.positions };
    for (const p of LINEUP_POSITIONS) {
      const r = v.positions?.[p];
      if (r && Number.isInteger(r.min) && Number.isInteger(r.max)) positions[p] = { min: r.min, max: Math.max(r.min, r.max) };
    }
    return {
      minPlayers: Number.isInteger(v.minPlayers) ? v.minPlayers! : DEFAULT_LINEUP_RULES.minPlayers,
      maxPlayers: Number.isInteger(v.maxPlayers) ? v.maxPlayers! : DEFAULT_LINEUP_RULES.maxPlayers,
      positions,
    };
  } catch {
    return DEFAULT_LINEUP_RULES;
  }
}

export type LineupCheck = {
  going: number;
  maybe: number;
  minPlayers: number;
  maxPlayers: number;
  /** Скільки людей бракує до мінімуму. */
  missingPlayers: number;
  positions: { position: LineupPosition; count: number; min: number; max: number }[];
  /** Позиції, яких бракує навіть після того, як універсали закрили що могли. */
  gaps: { position: LineupPosition; need: number }[];
  universalsUsed: number;
  tooMany: boolean;
  ok: boolean;
};

type AttendanceLike = { status: RsvpStatus; playerId: number | null };
type PlayerLike = { id: number; position: Position | null; status: PlayerStatus };

export function checkLineup(rules: LineupRules, attendance: AttendanceLike[], players: PlayerLike[]): LineupCheck {
  const byId = new Map(players.map((p) => [p.id, p]));
  const going = attendance.filter((a) => a.status === "going");
  const maybe = attendance.filter((a) => a.status === "maybe").length;

  const counts = Object.fromEntries(LINEUP_POSITIONS.map((p) => [p, 0])) as Record<LineupPosition, number>;
  let universals = 0;
  for (const a of going) {
    const pos = a.playerId != null ? byId.get(a.playerId)?.position : null;
    if (pos === "universal") universals++;
    else if (pos && pos in counts) counts[pos as LineupPosition]++;
  }

  let spare = universals;
  const gaps: LineupCheck["gaps"] = [];
  for (const p of LINEUP_POSITIONS) {
    let need = Math.max(0, rules.positions[p].min - counts[p]);
    const cover = Math.min(need, spare);
    spare -= cover;
    need -= cover;
    if (need > 0) gaps.push({ position: p, need });
  }

  const missingPlayers = Math.max(0, rules.minPlayers - going.length);
  return {
    going: going.length,
    maybe,
    minPlayers: rules.minPlayers,
    maxPlayers: rules.maxPlayers,
    missingPlayers,
    positions: LINEUP_POSITIONS.map((p) => ({ position: p, count: counts[p], ...rules.positions[p] })),
    gaps,
    universalsUsed: universals - spare,
    tooMany: going.length > rules.maxPlayers,
    ok: missingPlayers === 0 && gaps.length === 0,
  };
}

/** Гравці, які мали б відповісти, але ще не відповіли (травмованих не чіпаємо). */
export function nonResponders<P extends { id: number; status: PlayerStatus; telegramUserId: number | null }>(
  attendance: { playerId: number | null; telegramUserId: number | null }[],
  players: P[],
): P[] {
  const answeredPlayers = new Set(attendance.map((a) => a.playerId).filter((x) => x != null));
  const answeredUsers = new Set(attendance.map((a) => a.telegramUserId).filter((x) => x != null));
  return players.filter(
    (p) =>
      p.status !== "injured" &&
      !answeredPlayers.has(p.id) &&
      !(p.telegramUserId != null && answeredUsers.has(p.telegramUserId)),
  );
}
