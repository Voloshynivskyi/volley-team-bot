"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { setApiLang } from "@/lib/client/api";
import { tg } from "@/lib/client/tg";
import { dict, isLang, langFromCode, LANGS, type Dict, type Lang } from "@/lib/i18n";

/* Вибір мови вручну — зручність одного пристрою, тож localStorage.
   Якщо сховище недоступне, вибір живе в пам'яті до закриття застосунку. */
const KEY = "lang";
const listeners = new Set<() => void>();
let memoryChoice: Lang | null = null;

function readChoice(): Lang | null {
  try {
    const v = localStorage.getItem(KEY);
    if (isLang(v)) return v;
  } catch {
    /* сховище заблоковане */
  }
  return memoryChoice;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function chooseLang(lang: Lang) {
  memoryChoice = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* лишається в пам'яті */
  }
  listeners.forEach((f) => f());
}

const noopSubscribe = () => () => {};

type LangValue = { lang: Lang; t: Dict };
const LangCtx = createContext<LangValue>({ lang: "uk", t: dict("uk") });

/**
 * Мова: ручний вибір → мова Telegram користувача → мова команди.
 * На сервері й під час гідратації — завжди мова команди, щоб розмітка збіглась.
 */
export function LangProvider({
  userCode,
  teamLang,
  children,
}: {
  userCode?: string;
  teamLang: Lang;
  children: ReactNode;
}) {
  const choice = useSyncExternalStore(subscribe, readChoice, () => null);
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const code = userCode ?? (hydrated ? tg()?.initDataUnsafe.user?.language_code : undefined);
  const lang = choice ?? langFromCode(code, teamLang);

  // Модульна змінна, не стан React: запити мають одразу йти з правильною мовою.
  setApiLang(lang);

  const value = useMemo(() => ({ lang, t: dict(lang) }), [lang]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useT(): LangValue {
  return useContext(LangCtx);
}

/** Перемикач UA / RU / EN у шапці екрана. */
export function LangSwitch() {
  const { lang, t } = useT();
  return (
    <div role="radiogroup" aria-label={t.common.language} className="flex shrink-0 gap-0.5 rounded-lg bg-surface p-0.5">
      {LANGS.map((l) => {
        const active = l.value === lang;
        return (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => chooseLang(l.value)}
            className={`min-h-8 min-w-9 rounded-md px-1.5 text-[12px] font-semibold tracking-wide transition-colors ${
              active ? "bg-court-tint text-court" : "text-hint active:bg-court-tint"
            }`}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

/** Шапка вкладки: заголовок, підзаголовок і перемикач мови праворуч. */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
      <div className="min-w-0">
        <h1 className="text-[24px] font-semibold leading-tight [overflow-wrap:anywhere]">{title}</h1>
        {subtitle && <p className="text-[15px] text-hint">{subtitle}</p>}
      </div>
      <LangSwitch />
    </header>
  );
}
