"use client";

import { createContext, useContext } from "react";
import type { Me } from "@/lib/client/api";
import type { Dict, Lang } from "@/lib/i18n";

export type AppCtxValue = {
  me: Me;
  tz: string;
  isAdmin: boolean;
  /** Може додавати й редагувати гравців (учасник групи або адмін). */
  canEditPlayers: boolean;
  lang: Lang;
  t: Dict;
  openEvent: (id: number) => void;
};

export const AppCtx = createContext<AppCtxValue | null>(null);

export function useApp(): AppCtxValue {
  const v = useContext(AppCtx);
  if (!v) throw new Error("useApp outside AppCtx");
  return v;
}
