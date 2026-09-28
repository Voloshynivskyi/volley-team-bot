import { en } from "./en";
import { ru } from "./ru";
import { uk } from "./uk";

export type Dict = typeof uk;
export type Lang = "uk" | "ru" | "en";
export type ErrorKey = {
  [K in keyof Dict["errors"]]: Dict["errors"][K] extends string ? K : never;
}[keyof Dict["errors"]];

export const LANGS: { value: Lang; label: string }[] = [
  { value: "uk", label: "UA" },
  { value: "ru", label: "RU" },
  { value: "en", label: "EN" },
];

const DICTS: Record<Lang, Dict> = { uk, ru, en };

export function isLang(x: unknown): x is Lang {
  return x === "uk" || x === "ru" || x === "en";
}

export function dict(lang: Lang): Dict {
  return DICTS[lang];
}

/** Код мови з Telegram (language_code) → одна з наших мов; інше — мова команди за замовчуванням. */
export function langFromCode(code: string | null | undefined, fallback: Lang = "uk"): Lang {
  const c = code?.toLowerCase().slice(0, 2);
  if (c === "uk") return "uk";
  if (c === "ru" || c === "be") return "ru";
  if (c === "en") return "en";
  return fallback;
}

/** Мова з заголовка, який шле Mini App. */
export function langFromRequest(req: Request): Lang {
  const v = req.headers.get("x-lang");
  return isLang(v) ? v : "uk";
}

/** Тур, записаний просто числом, показуємо мовою читача: "3" → "3 тур" / "Round 3". */
export function fmtRound(t: Dict, round: string | null | undefined): string | null {
  if (!round) return null;
  return /^\d+$/.test(round.trim()) ? t.roundN(round.trim()) : round;
}

export function ucFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
