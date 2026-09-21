"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import type { RsvpStatus } from "@/db/schema";
import { api, EVENTS_UPCOMING_KEY, eventKey, usePlayers, type EventDTO, type PlayerDTO } from "@/lib/client/api";
import { haptic } from "@/lib/client/tg";
import { positionShort, RSVP } from "@/lib/positions";
import { errorText, Spinner, useToast } from "./ui";

const ACTIVE: Record<RsvpStatus, string> = {
  going: "bg-going text-white",
  maybe: "bg-maybe text-white",
  not_going: "bg-not text-white",
};

/** Блок для адміна: відмітити явку за будь-кого зі складу, навіть без Telegram. */
export default function RosterAttendance({ event }: { event: EventDTO }) {
  const { data: players, isLoading } = usePlayers();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const statusOf = (p: PlayerDTO): RsvpStatus | null =>
    event.attendance.find(
      (a) => a.playerId === p.id || (p.telegramUserId != null && a.telegramUserId === p.telegramUserId),
    )?.status ?? null;

  async function set(p: PlayerDTO, status: RsvpStatus) {
    if (pendingId != null) return;
    // Повторний тап по активній кнопці знімає відмітку.
    const next = statusOf(p) === status ? null : status;
    haptic("light");
    setPendingId(p.id);
    try {
      const updated = await api<EventDTO>(`/api/events/${event.id}/attendance`, {
        method: "POST",
        body: { playerId: p.id, status: next },
      });
      await mutate(eventKey(event.id), updated, { revalidate: false });
      mutate(EVENTS_UPCOMING_KEY);
    } catch (err) {
      toast(errorText(err), "error");
      haptic("error");
    } finally {
      setPendingId(null);
    }
  }

  const marked = (players ?? []).filter((p) => statusOf(p) !== null).length;

  return (
    <div className="overflow-hidden rounded-2xl bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-court-tint"
      >
        <span>
          <span className="block text-[16px] font-medium">Відмітити за гравців</span>
          <span className="block text-[13px] text-hint">
            {players ? `Відмічено ${marked} з ${players.length}` : "Для тих, хто не в Telegram або забув"}
          </span>
        </span>
        <span className={`text-hint transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
          ›
        </span>
      </button>

      {open && isLoading && (
        <div className="flex justify-center py-5 text-hint">
          <Spinner small />
        </div>
      )}

      {open && players && players.length === 0 && (
        <p className="border-t border-sep px-4 py-4 text-[15px] text-hint">
          У складі ще нікого немає. Додайте гравців у вкладці «Склад».
        </p>
      )}

      {open &&
        players?.map((p) => {
          const current = statusOf(p);
          return (
            <div key={p.id} className="flex items-center gap-2.5 border-t border-sep px-4 py-2.5">
              <div className="numeral w-7 shrink-0 text-center text-[22px]">{p.number ?? "–"}</div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium leading-tight [overflow-wrap:anywhere]">{p.fullName}</p>
                <p className="text-[12px] text-hint">
                  {[positionShort(p.position), p.status === "injured" ? "травма" : p.status === "reserve" ? "резерв" : null]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
              <div className={`flex shrink-0 gap-1 ${pendingId === p.id ? "opacity-50" : ""}`}>
                {RSVP.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => set(p, r.value)}
                    aria-label={`${p.fullName}: ${r.label}`}
                    aria-pressed={current === r.value}
                    className={`flex h-10 w-9 items-center justify-center rounded-lg text-[16px] transition-colors ${
                      current === r.value ? ACTIVE[r.value] : "bg-field border border-sep active:bg-court-tint"
                    }`}
                  >
                    {r.emoji}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}
