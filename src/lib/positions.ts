import type { CompetitionType, EventType, PlayerStatus, Position, RsvpStatus } from "@/db/schema";
import type { Dict } from "@/lib/i18n";

// Порядок значень для списків і форм. Підписи — у словниках i18n.
export const POSITION_VALUES: Position[] = ["setter", "opposite", "middle", "outside", "libero", "universal"];
export const PLAYER_STATUS_VALUES: PlayerStatus[] = ["active", "reserve", "injured"];
export const COMPETITION_TYPE_VALUES: CompetitionType[] = ["league", "tournament", "friendly"];
export const EVENT_TYPE_VALUES: EventType[] = ["game", "training"];
export const RSVP_VALUES: RsvpStatus[] = ["going", "maybe", "not_going"];

export const RSVP_EMOJI: Record<RsvpStatus, string> = { going: "✅", maybe: "🤔", not_going: "❌" };

export function positionLabel(t: Dict, p: Position | null | undefined) {
  return p ? t.positions[p].label : "";
}

export function positionShort(t: Dict, p: Position | null | undefined) {
  return p ? t.positions[p].short : "";
}

/** Опції для <Segmented>: значення + підпис зі словника. */
export function options<T extends string>(values: T[], labels: Record<T, string>) {
  return values.map((value) => ({ value, label: labels[value] }));
}
