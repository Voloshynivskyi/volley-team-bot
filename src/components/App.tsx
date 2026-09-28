"use client";

import { useEffect, useMemo, useState } from "react";
import { useMe, type ApiError, type Me } from "@/lib/client/api";
import { tg } from "@/lib/client/tg";
import { AppCtx, type AppCtxValue } from "./context";
import EventDetails from "./EventDetails";
import { LangProvider, LangSwitch, useT } from "./i18n";
import Manage from "./Manage";
import Onboarding from "./Onboarding";
import Roster from "./Roster";
import Schedule from "./Schedule";
import Standings from "./Standings";
import { Button, Spinner, ToastProvider } from "./ui";

type Tab = "schedule" | "table" | "roster" | "manage";

export default function App() {
  const { data: me, error, mutate } = useMe();

  useEffect(() => {
    const w = tg();
    if (!w) return;
    w.ready();
    w.expand();
    // Щоб свайп униз по формі не закривав застосунок (Bot API 7.7+).
    if (w.isVersionAtLeast("7.7")) w.disableVerticalSwipes?.();
  }, []);

  return (
    <LangProvider userCode={me?.user.language_code} teamLang={me?.settings.language ?? "uk"}>
      <AppBody me={me} error={error} retry={() => mutate()} />
    </LangProvider>
  );
}

function AppBody({ me, error, retry }: { me?: Me; error?: ApiError; retry: () => void }) {
  const { lang, t } = useT();
  const [tab, setTab] = useState<Tab>("schedule");
  const [openId, setOpenId] = useState<number | null>(null);
  // Deep link з треду (t.me/bot?startapp=event_12) відкриває подію один раз, поки її не закрили.
  const [deepLinkDismissed, setDeepLinkDismissed] = useState(false);
  const deepLinkId = Number(me?.startParam?.match(/^event_(\d+)$/)?.[1]) || null;
  const shownId = openId ?? (deepLinkDismissed ? null : deepLinkId);

  const ctx = useMemo<AppCtxValue | null>(
    () =>
      me
        ? {
            me,
            tz: me.settings.timezone,
            isAdmin: me.isAdmin,
            canEditPlayers: me.isAdmin || me.isMember,
            lang,
            t,
            openEvent: setOpenId,
          }
        : null,
    [me, lang, t],
  );

  const closeEvent = () => {
    setOpenId(null);
    setDeepLinkDismissed(true);
  };

  if (error) {
    const unauthorized = error.status === 401;
    return (
      <Gate
        title={unauthorized ? t.gate.openInTelegramTitle : t.gate.loadFailedTitle}
        text={unauthorized ? t.gate.openInTelegramText : error.message}
        action={!unauthorized && <Button onClick={retry}>{t.common.retry}</Button>}
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
          {tab === "table" && <Standings />}
          {tab === "roster" && <Roster />}
          {tab === "manage" && ctx.isAdmin && <Manage />}
        </div>
        <TabBar tab={tab} setTab={setTab} isAdmin={ctx.isAdmin} />
        <EventDetails id={shownId} onClose={closeEvent} />
        <Onboarding />
      </AppCtx.Provider>
    </ToastProvider>
  );
}

function Gate({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <div className="absolute right-4 top-4">
        <LangSwitch />
      </div>
      <p className="text-[20px] font-semibold">{title}</p>
      <p className="mt-2 text-[15px] text-hint">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function TabBar({ tab, setTab, isAdmin }: { tab: Tab; setTab: (t: Tab) => void; isAdmin: boolean }) {
  const { t } = useT();
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "schedule", label: t.tabs.schedule, icon: <CalendarIcon /> },
    { id: "table", label: t.table.title, icon: <TrophyIcon /> },
    { id: "roster", label: t.tabs.roster, icon: <PeopleIcon /> },
  ];
  if (isAdmin) tabs.push({ id: "manage", label: t.tabs.manage, icon: <SlidersIcon /> });

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-sep bg-surface"
      style={{ paddingBottom: "var(--safe-bottom)" }}
      aria-label={t.tabs.nav}
    >
      <div className="mx-auto flex max-w-lg">
        {tabs.map((x) => {
          const active = x.id === tab;
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => setTab(x.id)}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[12px] font-medium transition-colors ${
                active ? "text-court" : "text-hint"
              }`}
            >
              {x.icon}
              {x.label}
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
function TrophyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" strokeLinejoin="round" />
      <path d="M7 6H4.5v1.5A3 3 0 0 0 7.5 10.5M17 6h2.5v1.5a3 3 0 0 1-3 3" strokeLinecap="round" />
      <path d="M12 14v3.5M8.5 20.5h7M9.5 17.5h5v3h-5z" strokeLinecap="round" strokeLinejoin="round" />
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
