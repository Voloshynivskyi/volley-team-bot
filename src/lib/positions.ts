import type { CompetitionType, EventType, PlayerStatus, Position, RsvpStatus } from "@/db/schema";

export const POSITIONS: { value: Position; label: string; short: string }[] = [
  { value: "setter", label: "Зв'язуючий", short: "З" },
  { value: "opposite", label: "Діагональний", short: "Д" },
  { value: "middle", label: "Центральний блокуючий", short: "ЦБ" },
  { value: "outside", label: "Доводчик", short: "Дв" },
  { value: "libero", label: "Ліберо", short: "Л" },
  { value: "universal", label: "Універсал", short: "У" },
];

export function positionLabel(p: Position | null | undefined) {
  return POSITIONS.find((x) => x.value === p)?.label ?? "";
}
export function positionShort(p: Position | null | undefined) {
  return POSITIONS.find((x) => x.value === p)?.short ?? "";
}

export const PLAYER_STATUS: { value: PlayerStatus; label: string }[] = [
  { value: "active", label: "Основа" },
  { value: "reserve", label: "Резерв" },
  { value: "injured", label: "Травма" },
];

export const COMPETITION_TYPES: { value: CompetitionType; label: string }[] = [
  { value: "league", label: "Ліга" },
  { value: "tournament", label: "Турнір" },
  { value: "friendly", label: "Товариські" },
];

export const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "game", label: "Гра" },
  { value: "training", label: "Тренування" },
];

export const RSVP: { value: RsvpStatus; label: string; emoji: string }[] = [
  { value: "going", label: "Іду", emoji: "✅" },
  { value: "maybe", label: "Можливо", emoji: "🤔" },
  { value: "not_going", label: "Не йду", emoji: "❌" },
];

export function rsvpLabel(s: RsvpStatus) {
  return RSVP.find((x) => x.value === s)!;
}
