"use client";

import { useEffect, useMemo, useState } from "react";
import { useMe } from "@/lib/client/api";
import { tg } from "@/lib/client/tg";
import { AppCtx } from "./context";
import EventDetails from "./EventDetails";
import Manage from "./Manage";
import Roster from "./Roster";
import Schedule from "./Schedule";
import { Button, Spinner, ToastProvider } from "./ui";

type Tab = "schedule" | "roster" | "manage";

export default function App() {
  const { data: me, error, mutate } = useMe();
  const [tab, setTab] = useState<Tab>("schedule");
  const [openId, setOpenId] = useState<number | null>(null);
  // Deep link з треду (t.me/bot?startapp=event_12) відкриває подію один раз, поки її не закрили.
  const [deepLinkDismissed, setDeepLinkDismissed] = useState(false);
  const deepLinkId = Number(me?.startParam?.match(/^event_(\d+)$/)?.[1]) || null;
  const shownId = openId ?? (deepLinkDismissed ? null : deepLinkId);

  useEffect(() => {
    const w = tg();
    if (!w) return;
    w.ready();
    w.expand();
    // Щоб свайп униз по формі не закривав застосунок (Bot API 7.7+).
    if (w.isVersionAtLeast("7.7")) w.disableVerticalSwipes?.();
  }, []);

  const ctx = useMemo(
    () => (me ? { me, tz: me.settings.timezone, isAdmin: me.isAdmin, openEvent: setOpenId } : null),
    [me],
  );

  const closeEvent = () => {
    setOpenId(null);
    setDeepLinkDismissed(true);
  };

  if (error) {
    const unauthorized = error.status === 401;
    return (
      <Gate
        title={unauthorized ? "Відкрийте через Telegram" : "Не вдалося завантажити"}
        text={
          unauthorized
            ? "Цей застосунок працює всередині Telegram: відкрийте бота й натисніть кнопку «Відкрити застосунок»."
            : error.message
        }
        action={!unauthorized && <Button onClick={() => mutate()}>Спробувати ще раз</Button>}
      />
    );
  }

  if (!ctx) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-hint">
        <Spinner />
      </div>
    );
  }

  return (
    <ToastProvider>
      <AppCtx.Provider value={ctx}>
        <div
          className="mx-auto max-w-lg"
          // Знизу: таб-бар + плаваюча кнопка, щоб останній рядок списку не ховався під ними.
          style={{ paddingTop: "var(--safe-top)", paddingBottom: "calc(var(--safe-bottom) + 8.5rem)" }}
        >
          {tab === "schedule" && <Schedule />}
          {tab === "roster" && <Roster />}
          {tab === "manage" && ctx.isAdmin && <Manage />}
        </div>
        <TabBar tab={tab} setTab={setTab} isAdmin={ctx.isAdmin} />
        <EventDetails id={shownId} onClose={closeEvent} />
      </AppCtx.Provider>
    </ToastProvider>
  );
}

function Gate({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <p className="text-[20px] font-semibold">{title}</p>
      <p className="mt-2 text-[15px] text-hint">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function TabBar({ tab, setTab, isAdmin }: { tab: Tab; setTab: (t: Tab) => void; isAdmin: boolean }) {
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "schedule", label: "Розклад", icon: <CalendarIcon /> },
    { id: "roster", label: "Склад", icon: <PeopleIcon /> },
  ];
  if (isAdmin) tabs.push({ id: "manage", label: "Керування", icon: <SlidersIcon /> });

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-sep bg-surface"
      style={{ paddingBottom: "var(--safe-bottom)" }}
      aria-label="Розділи"
    >
      <div className="mx-auto flex max-w-lg">
        {tabs.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[12px] font-medium transition-colors ${
                active ? "text-court" : "text-hint"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function CalendarIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}
function PeopleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 19.5c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" strokeLinecap="round" />
      <circle cx="17" cy="9.5" r="2.5" />
      <path d="M16 14.5c2.7 0 4.9 1.5 5.5 4.5" strokeLinecap="round" />
    </svg>
  );
}
function SlidersIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
      <circle cx="9" cy="7" r="2" fill="var(--surface)" />
      <circle cx="15" cy="12" r="2" fill="var(--surface)" />
      <circle cx="7" cy="17" r="2" fill="var(--surface)" />
    </svg>
  );
}
