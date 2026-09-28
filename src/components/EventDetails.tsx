"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { api, isEventsKey, useEvent, type EventDTO } from "@/lib/client/api";
import { confirmDialog, haptic, openLink } from "@/lib/client/tg";
import { fmtRound, ucFirst } from "@/lib/i18n";
import { RSVP_VALUES } from "@/lib/positions";
import { fmtDayLong, fmtTime } from "@/lib/time";
import { useApp } from "./context";
import EventForm from "./EventForm";
import { isMine, Rsvp } from "./Rsvp";
import RosterAttendance from "./RosterAttendance";
import { Button, errorText, Input, Sheet, Spinner, useToast } from "./ui";

export default function EventDetails({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { isAdmin, me, t } = useApp();
  const { data: e, error, isLoading } = useEvent(id);
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => mutate(isEventsKey);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
      haptic("success");
    } catch (err) {
      toast(errorText(err), "error");
      haptic("error");
    } finally {
      setBusy(null);
    }
  }

  const announce = () =>
    run("announce", async () => {
      const r = await api<{ message: string }>(`/api/events/${id}/announce`, { method: "POST" });
      toast(r.message);
    });

  const setStatus = (status: "scheduled" | "cancelled") =>
    run("status", async () => {
      await api(`/api/events/${id}`, { method: "PATCH", body: { status } });
      await refresh();
      toast(status === "cancelled" ? t.event.cancelledToast : t.event.restoredToast);
    });

  const remove = async () => {
    if (!(await confirmDialog(t.event.deleteConfirm))) return;
    await run("delete", async () => {
      await api(`/api/events/${id}`, { method: "DELETE" });
      await refresh();
      toast(t.event.deletedToast);
      onClose();
    });
  };

  const title = !e ? "" : e.type === "game" ? (e.opponent ?? t.schedule.opponentTbd) : t.eventTypes.training;

  return (
    <Sheet open={id != null} onClose={onClose} title={e ? t.eventTypes[e.type] : t.event.sheetTitle}>
      {isLoading && (
        <div className="flex justify-center py-10 text-hint">
          <Spinner />
        </div>
      )}
      {error && <p className="py-6 text-center text-hint">{error.message}</p>}

      {e && (
        <div className="space-y-5 pb-2">
          <div>
            {e.type === "game" && (e.competition || e.round) && (
              <p className="text-[15px] text-hint">
                {[e.competition?.name, fmtRound(t, e.round)].filter(Boolean).join(", ")}
              </p>
            )}
            <h3 className="font-cond text-[40px] font-bold leading-none tracking-tight">{title}</h3>
            {e.status === "cancelled" && <p className="mt-2 font-medium text-not">{t.schedule.cancelled}</p>}
          </div>

          <DateBlock event={e} />

          {e.status === "finished" && e.scoreUs != null && e.scoreThem != null && (
            <div className="rounded-2xl bg-surface p-4 text-center">
              <p className={`numeral text-[48px] ${e.scoreUs > e.scoreThem ? "text-going" : "text-not"}`}>
                {e.scoreUs}:{e.scoreThem}
              </p>
              <p className="mt-1 text-[15px] text-hint">{e.scoreUs > e.scoreThem ? t.event.win : t.event.loss}</p>
            </div>
          )}

          <InfoList event={e} />

          {e.status === "scheduled" && (
            <div className="rounded-2xl bg-surface p-4">
              <Rsvp event={e} showCounts={false} />
              <AttendanceLists event={e} myId={me.user.id} myPlayerId={me.player?.id ?? null} />
            </div>
          )}

          {isAdmin && e.status === "scheduled" && <RosterAttendance event={e} />}

          {isAdmin && (
            <div className="space-y-2">
              <p className="px-1 text-[14px] font-medium text-hint">{t.event.manage}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => setEditOpen(true)}>{t.event.edit}</Button>
                {e.status === "scheduled" && (
                  <Button onClick={announce} loading={busy === "announce"} disabled={!me.settings.chatBound}>
                    {t.event.announce}
                  </Button>
                )}
                {e.type === "game" && e.status !== "cancelled" && (
                  <Button onClick={() => setResultOpen((v) => !v)}>
                    {e.status === "finished" ? t.event.changeScore : t.event.setScore}
                  </Button>
                )}
                {e.status === "cancelled" ? (
                  <Button onClick={() => setStatus("scheduled")} loading={busy === "status"}>
                    {t.event.restore}
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => setStatus("cancelled")} loading={busy === "status"}>
                    {t.event.cancelEvent}
                  </Button>
                )}
                <Button variant="danger" onClick={remove} loading={busy === "delete"}>
                  {t.common.delete}
                </Button>
              </div>
              {!me.settings.chatBound && e.status === "scheduled" && (
                <p className="px-1 text-[13px] text-hint">{t.event.announceHint}</p>
              )}
              {resultOpen && (
                <ResultForm
                  event={e}
                  onDone={async () => {
                    setResultOpen(false);
                    await refresh();
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}

      {e && <EventForm open={editOpen} onClose={() => setEditOpen(false)} event={e} />}
    </Sheet>
  );
}

function DateBlock({ event: e }: { event: EventDTO }) {
  const { tz, lang } = useApp();
  const d = new Date(e.startsAt);
  return (
    <div className="flex items-end justify-between gap-4 rounded-2xl bg-surface px-4 py-3">
      <div>
        <p className="text-[17px] font-medium">{ucFirst(fmtDayLong(d, tz, lang))}</p>
        <p className="text-[14px] text-hint">{d.getFullYear()}</p>
      </div>
      <p className="numeral text-[44px]">{fmtTime(d, tz)}</p>
    </div>
  );
}

function InfoList({ event: e }: { event: EventDTO }) {
  const { t } = useApp();
  const rows: { icon: string; text: string; onClick?: () => void }[] = [];
  const where = [e.venueName, e.venueAddress].filter(Boolean).join(", ");
  const side = e.type === "game" && e.isHome != null ? (e.isHome ? t.schedule.home : t.schedule.away) : null;
  if (where || side) {
    rows.push({
      icon: "📍",
      text: [where, side].filter(Boolean).join(" — "),
      onClick: e.venueMapUrl ? () => openLink(e.venueMapUrl!) : undefined,
    });
  }
  if (e.kit) rows.push({ icon: "👕", text: e.kit });
  if (e.note) rows.push({ icon: "📝", text: e.note });
  if (e.competition?.standingsUrl) {
    rows.push({ icon: "📊", text: t.event.standings, onClick: () => openLink(e.competition!.standingsUrl!) });
  }
  if (!rows.length) return null;
  return (
    <div className="overflow-hidden rounded-2xl bg-surface">
      {rows.map((r, i) => {
        const inner = (
          <>
            <span aria-hidden className="w-6 shrink-0 text-center">
              {r.icon}
            </span>
            <span className={`flex-1 whitespace-pre-line text-[15px] ${r.onClick ? "text-court" : ""}`}>{r.text}</span>
          </>
        );
        const cls = "flex w-full items-start gap-3 px-4 py-3 text-left border-b border-sep last:border-b-0";
        return r.onClick ? (
          <button key={i} type="button" onClick={r.onClick} className={`${cls} active:bg-court-tint`}>
            {inner}
          </button>
        ) : (
          <div key={i} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function AttendanceLists({
  event: e,
  myId,
  myPlayerId,
}: {
  event: EventDTO;
  myId: number;
  myPlayerId: number | null;
}) {
  const { t } = useApp();
  const tone = { going: "text-going", maybe: "text-maybe", not_going: "text-not" } as const;
  if (!e.attendance.length) return <p className="mt-3 text-[14px] text-hint">{t.event.nobodyBeFirst}</p>;
  return (
    <div className="mt-4 space-y-3">
      {RSVP_VALUES.map((status) => {
        const list = e.attendance.filter((a) => a.status === status);
        if (!list.length) return null;
        return (
          <div key={status}>
            <p className={`text-[14px] font-medium ${tone[status]}`}>
              {t.rsvpGroups[status]} <span className="numeral text-[16px]">{list.length}</span>
            </p>
            <p className="mt-0.5 text-[15px] leading-relaxed">
              {list.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ", "}
                  <span className={isMine(a, myId, myPlayerId) ? "font-medium" : ""}>{a.displayName}</span>
                </span>
              ))}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ResultForm({ event: e, onDone }: { event: EventDTO; onDone: () => Promise<void> }) {
  const { t } = useApp();
  const toast = useToast();
  const [us, setUs] = useState(e.scoreUs != null ? String(e.scoreUs) : "");
  const [them, setThem] = useState(e.scoreThem != null ? String(e.scoreThem) : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    const a = Number(us);
    const b = Number(them);
    if (!Number.isInteger(a) || !Number.isInteger(b) || us === "" || them === "") {
      toast(t.event.scoreInvalid, "error");
      return;
    }
    setSaving(true);
    try {
      await api(`/api/events/${e.id}`, { method: "PATCH", body: { scoreUs: a, scoreThem: b, status: "finished" } });
      toast(t.event.scoreSaved);
      await onDone();
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl bg-surface p-4">
      <p className="mb-3 text-[14px] text-hint">{t.event.scoreTitle}</p>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <span className="mb-1 block text-[13px] text-hint">{t.event.us}</span>
          <Input inputMode="numeric" pattern="[0-9]*" maxLength={1} value={us} onChange={(ev) => setUs(ev.target.value)} className="numeral text-center text-[24px]" />
        </div>
        <span className="numeral pt-5 text-[28px] text-hint">:</span>
        <div className="flex-1">
          <span className="mb-1 block text-[13px] text-hint">{e.opponent ?? t.event.opponent}</span>
          <Input inputMode="numeric" pattern="[0-9]*" maxLength={1} value={them} onChange={(ev) => setThem(ev.target.value)} className="numeral text-center text-[24px]" />
        </div>
      </div>
      <Button variant="primary" block className="mt-3" onClick={save} loading={saving}>
        {t.event.saveScore}
      </Button>
    </div>
  );
}
