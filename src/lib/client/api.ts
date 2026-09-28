import useSWR from "swr";
import type { Attendance, AuditEntry, Competition, Event, LeagueMatch, Player, Settings } from "@/db/schema";
import { dict, type Lang } from "@/lib/i18n";
import type { LineupRules } from "@/lib/lineup";
import type { PlayoffStatus, StandingRow } from "@/lib/standings";
import { initData } from "./tg";

// Поточна мова інтерфейсу: сервер відповідає помилками цією мовою.
let apiLang: Lang = "uk";
export function setApiLang(lang: Lang) {
  apiLang = lang;
}
export function getApiLang(): Lang {
  return apiLang;
}

/** Дати після JSON — рядки. */
type Iso<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

export type PlayerDTO = Iso<Player>;
export type CompetitionDTO = Iso<Competition>;
export type AttendanceDTO = Iso<Attendance>;
export type SettingsDTO = Iso<Settings>;
export type EventDTO = Iso<Event> & {
  competition: CompetitionDTO | null;
  attendance: AttendanceDTO[];
  /** Лише в картці однієї події. */
  mvp?: { names: string[]; votes: number; closed: boolean } | null;
};
export type AuditDTO = Iso<AuditEntry>;
export type LeagueMatchDTO = Iso<LeagueMatch> & { isOurs: boolean };
export type StandingsDTO = {
  leagues: {
    competition: { id: number; name: string; shortName: string | null; standingsUrl: string | null };
    mode: "computed" | "external";
    rows: (StandingRow & { isUs: boolean })[];
    spots: number | null;
    status: PlayoffStatus | null;
    us: StandingRow | null;
    matches: LeagueMatchDTO[];
    error?: "external_failed";
  }[];
  mvp: { playerId: number; fullName: string; number: number | null; wins: number }[];
};

export type Me = {
  user: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    language_code?: string;
  };
  isAdmin: boolean;
  /** Учасник групи команди: може додавати й редагувати гравців. */
  isMember: boolean;
  player: PlayerDTO | null;
  startParam: string | null;
  settings: {
    teamName: string;
    timezone: string;
    language: Lang;
    chatBound: boolean;
    chatTitle: string | null;
    threadId: number | null;
    reminderHours: string;
    announceDaysBefore: number;
    arriveMinutes: number;
    lineupRules: LineupRules;
    calendarUrl: string | null;
  };
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { "x-lang": apiLang };
  const data = initData();
  if (data) headers.Authorization = `tma ${data}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, payload?.error ?? dict(apiLang).errors.http(res.status));
  return payload as T;
}

const fetcher = <T,>(path: string) => api<T>(path);

export function useMe() {
  return useSWR<Me, ApiError>("/api/me", fetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
}

export const EVENTS_UPCOMING_KEY = "/api/events?scope=upcoming";
export const EVENTS_PAST_KEY = "/api/events?scope=past";
export const eventKey = (id: number) => `/api/events/${id}`;
/** Фільтр для mutate: усі кеші, що стосуються подій. */
export const isEventsKey = (key: unknown) => typeof key === "string" && key.startsWith("/api/events");

export function useEvents(scope: "upcoming" | "past", enabled = true) {
  return useSWR<EventDTO[], ApiError>(enabled ? (scope === "past" ? EVENTS_PAST_KEY : EVENTS_UPCOMING_KEY) : null, fetcher);
}

export function useEvent(id: number | null) {
  return useSWR<EventDTO, ApiError>(id ? eventKey(id) : null, fetcher);
}

export function usePlayers() {
  return useSWR<PlayerDTO[], ApiError>("/api/players", fetcher);
}

export function useCompetitions(all = false) {
  return useSWR<CompetitionDTO[], ApiError>(all ? "/api/competitions?all=1" : "/api/competitions", fetcher);
}

export function useSettings(enabled: boolean) {
  return useSWR<SettingsDTO, ApiError>(enabled ? "/api/settings" : null, fetcher);
}

export const STANDINGS_KEY = "/api/standings";

export function useStandings(enabled = true) {
  return useSWR<StandingsDTO, ApiError>(enabled ? STANDINGS_KEY : null, fetcher);
}

export function useAudit(entity: string | null, id?: number | null, limit = 50) {
  const key = entity ? `/api/audit?entity=${entity}${id ? `&id=${id}` : ""}&limit=${limit}` : null;
  return useSWR<AuditDTO[], ApiError>(key, fetcher, { revalidateOnFocus: false });
}

/** Копіювання в буфер з запасним способом для старих WebView. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
