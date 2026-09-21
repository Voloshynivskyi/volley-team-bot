"use client";

import { createContext, useContext } from "react";
import type { Me } from "@/lib/client/api";

export type AppCtxValue = {
  me: Me;
  tz: string;
  isAdmin: boolean;
  openEvent: (id: number) => void;
};

export const AppCtx = createContext<AppCtxValue | null>(null);

export function useApp(): AppCtxValue {
  const v = useContext(AppCtx);
  if (!v) throw new Error("useApp поза AppCtx");
  return v;
}
