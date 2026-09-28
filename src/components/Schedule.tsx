"use client";

import { useMemo, useState } from "react";
import { copyText, useEvents, type EventDTO } from "@/lib/client/api";
import { openLink } from "@/lib/client/tg";
import { RSVP_EMOJI } from "@/lib/positions";
import { fmtRound, ucFirst } from "@/lib/i18n";
import {
  calendarDaysFromToday,
  fmtDayLong,
  fmtDayNumber,
  fmtMonthYear,
  fmtTime,
  fmtWeekdayShort,
  monthKey,
} from "@/lib/time";
import { useApp } from "./context";
import EventForm from "./EventForm";
import { PageHeader } from "./i18n";
import { LineupSummary, useLineup } from "./Lineup";
import { isMine, Rsvp } from "./Rsvp";
import { Button, Empty, Fab, Row, Section, Segmented, Sheet, Spinner, useToast } from "./ui";

type Scope = "upcoming" | "past";

export default function Schedule() {
  const { me, tz, lang, t, isAdmin, openEvent } = useApp();
  const [scope, setScope] = useState<Scope>("upcoming");
  const [formOpen, setFormOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const upcoming = useEvents("upcoming");
  const past = useEvents("past", scope === "past");

  const next = upcoming.data?.find((e) => e.status === "scheduled") ?? null;
  const list = scope === "upcoming" ? upcoming.data?.filter((e) => e.id !== next?.id) : past.data;
  const loading = scope === "upcoming" ? upcoming.isLoading : past.isLoading;

  const groups = useMemo(() => {
    const map = new Map<string, { title: string; items: EventDTO[] }>();
    for (const e of list ?? []) {
      const d = new Date(e.startsAt);
      const k = monthKey(d, tz);
      if (!map.has(k)) map.set(k, { title: fmtMonthYear(d, tz, lang), items: [] });
      map.get(k)!.items.push(e);
    }
    return [...map.values()];
  }, [list, tz, lang]);

  return (
    <>
      <PageHeader title={me.settings.teamName} />

      {scope === "upcoming" && next && <NextHero event={next} onOpen={() => openEvent(next.id)} />}

      <div className="px-4 pb-3 pt-1">
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: "upcoming", label: t.schedule.upcoming },
            { value: "past", label: t.schedule.past },
          ]}
        />
      </div>

      {loading && (
        <div className="flex justify-center py-10 text-hint">
          <Spinner />
        </div>
      )}

      {!loading && groups.length === 0 && (
        <Section>
          {scope === "upcoming" ? (
            next ? (
              <Empty title={t.schedule.nothingMoreTitle} text={t.schedule.nothingMoreText} />
            ) : (
              <Empty
                title={t.schedule.emptyTitle}
                text={isAdmin ? t.schedule.emptyAdmin : t.schedule.emptyViewer}
                action={
                  isAdmin && (
                    <Button variant="primary" onClick={() => setFormOpen(true)}>
                      {t.schedule.addEvent}
                    </Button>
                  )
                }
              />
            )
          ) : (
            <Empty title={t.schedule.pastEmptyTitle} text={t.schedule.pastEmptyText} />
          )}
        </Section>
      )}

      <div className="space-y-5">
        {groups.map((g) => (
          <Section key={g.title} title={g.title}>
            {g.items.map((e) => (
              <EventRow key={e.id} event={e} onClick={() => openEvent(e.id)} />
            ))}
          </Section>
        ))}
      </div>

      {me.settings.calendarUrl && (
        <Section className="mt-5">
          <Row onClick={() => setCalOpen(true)}>
            <span aria-hidden className="text-[20px]">
              📅
            </span>
            <span className="flex-1 text-[16px] font-medium">{t.calendar.row}</span>
            <span className="text-hint" aria-hidden>
              ›
            </span>
          </Row>
        </Section>
      )}

      {isAdmin && <Fab label={t.schedule.fab} onClick={() => setFormOpen(true)} />}
      <EventForm open={formOpen} onClose={() => setFormOpen(false)} />
      {me.settings.calendarUrl && (
        <CalendarSheet open={calOpen} onClose={() => setCalOpen(false)} url={me.settings.calendarUrl} />
      )}
    </>
  );
}

function NextHero({ event: e, onOpen }: { event: EventDTO; onOpen: () => void }) {
  const { tz, lang, t, me } = useApp();
  const lineup = useLineup(e);
  const d = new Date(e.startsAt);
  const arrive =
    e.type === "game" && me.settings.arriveMinutes > 0 ? new Date(d.getTime() - me.settings.arriveMinutes * 60_000) : null;
  const isGame = e.type === "game";
  const days = calendarDaysFromToday(d, tz);
  const title = isGame ? (e.opponent ?? t.schedule.opponentTbd) : t.eventTypes.training;
  const sub = isGame ? [e.competition?.name, fmtRound(t, e.round)].filter(Boolean).join(", ") : null;
  const where = [e.venueName, e.venueAddress].filter(Boolean).join(", ");
  const side = isGame && e.isHome != null ? (e.isHome ? t.schedule.home : t.schedule.away) : null;

  return (
    <section className="px-4 pb-2">
      <div className="overflow-hidden rounded-2xl bg-surface">
        <button type="button" onClick={onOpen} className="block w-full px-5 pt-4 text-left active:bg-court-tint">
          <p className="text-[14px] font-medium text-court">
            {isGame ? t.schedule.nextGame : t.schedule.nextTraining}
            <span className="text-hint"> — {t.relDays(days)}</span>
          </p>
          <h2 className="mt-1 font-cond text-[36px] font-bold leading-none tracking-tight">{title}</h2>
          {sub && <p className="mt-1 text-[15px] text-hint">{sub}</p>}

          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[15px] text-hint">{ucFirst(fmtDayLong(d, tz, lang))}</p>
              {arrive && <p className="text-[15px] font-medium text-court">{t.arrive(fmtTime(arrive, tz))}</p>}
              {where && (
                <p className="mt-0.5 text-[15px]">
                  {where}
                  {side && <span className="text-hint"> — {side}</span>}
                </p>
              )}
              {!where && side && <p className="mt-0.5 text-[15px]">{ucFirst(side)}</p>}
            </div>
            <p className="numeral shrink-0 text-[44px]">{fmtTime(d, tz)}</p>
          </div>
        </button>
        <div className="px-4 pb-4 pt-4">
          <Rsvp event={e} />
          {lineup && (
            <p className="mt-1 px-1 text-[14px]">
              <LineupSummary check={lineup} />
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function EventRow({ event: e, onClick }: { event: EventDTO; onClick: () => void }) {
  const { tz, lang, t, me } = useApp();
  const lineup = useLineup(e);
  const mine = e.attendance.find((a) => isMine(a, me.user.id, me.player?.id))?.status ?? null;
  const d = new Date(e.startsAt);
  const isGame = e.type === "game";
  const cancelled = e.status === "cancelled";
  const finished = e.status === "finished";
  const title = isGame ? (e.opponent ?? t.schedule.opponentTbd) : t.eventTypes.training;
  const sub = isGame
    ? [e.competition?.name, e.isHome == null ? null : e.isHome ? t.schedule.home : t.schedule.away, e.venueName]
        .filter(Boolean)
        .join(", ")
    : e.venueName;
  const going = e.attendance.filter((a) => a.status === "going").length;
  const hasScore = finished && e.scoreUs != null && e.scoreThem != null;
  const won = hasScore && e.scoreUs! > e.scoreThem!;

  return (
    <Row onClick={onClick}>
      <div className={`w-11 shrink-0 text-center ${cancelled ? "opacity-40" : ""}`}>
        <div className="numeral text-[28px]">{fmtDayNumber(d, tz)}</div>
        <div className="text-[12px] text-hint">{fmtWeekdayShort(d, tz, lang)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[16px] font-medium ${cancelled ? "line-through text-hint" : ""}`}>
          {!isGame && <span aria-hidden>🏋️ </span>}
          {title}
        </p>
        <p className="truncate text-[13px] text-hint">
          {cancelled ? <span className="text-not">{t.schedule.cancelled}</span> : sub || (isGame ? t.eventTypes.game : "")}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {hasScore ? (
          <div className={`numeral text-[22px] ${won ? "text-going" : "text-not"}`}>
            {e.scoreUs}:{e.scoreThem}
          </div>
        ) : (
          <div className={`numeral text-[22px] ${cancelled ? "text-hint" : ""}`}>{fmtTime(d, tz)}</div>
        )}
        {!cancelled && !finished && (
          <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[12px]">
            {mine ? (
              <span aria-label={t.rsvp[mine]}>{RSVP_EMOJI[mine]}</span>
            ) : (
              <span className="rounded-md bg-maybe-tint px-1.5 py-px font-medium text-maybe">{t.lineup.noAnswer}</span>
            )}
            {lineup ? (
              <span className={lineup.ok ? "text-going" : "text-not"}>
                {lineup.going}/{lineup.minPlayers}
              </span>
            ) : (
              going > 0 && <span className="text-going">{t.schedule.goingCount(going)}</span>
            )}
          </div>
        )}
      </div>
    </Row>
  );
}

function CalendarSheet({ open, onClose, url }: { open: boolean; onClose: () => void; url: string }) {
  const { t } = useApp();
  const toast = useToast();
  const webcal = url.replace(/^https?:/, "webcal:");
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;

  async function copy() {
    if (await copyText(url)) toast(t.calendar.copied);
  }

  return (
    <Sheet open={open} onClose={onClose} title={t.calendar.title}>
      <div className="space-y-3 pb-2">
        <p className="text-[15px] text-hint">{t.calendar.text}</p>
        <Button variant="primary" size="lg" block onClick={() => openLink(google)}>
          {t.calendar.google}
        </Button>
        <Button size="lg" block onClick={() => openLink(url)}>
          {t.calendar.apple}
        </Button>
        <Button variant="ghost" block onClick={copy}>
          {t.calendar.copy}
        </Button>
        <p className="text-[13px] text-hint">{t.calendar.appleHint}</p>
      </div>
    </Sheet>
  );
}
