"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import type { RsvpStatus } from "@/db/schema";
import { api, EVENTS_UPCOMING_KEY, eventKey, type AttendanceDTO, type EventDTO } from "@/lib/client/api";
import { haptic } from "@/lib/client/tg";
import { RSVP_EMOJI, RSVP_VALUES } from "@/lib/positions";
import { useApp } from "./context";
import { errorText, Segmented, useToast } from "./ui";

/** Мій запис: або я натискав сам (telegram id), або адмін відмітив мене як гравця (player id). */
export function isMine(a: AttendanceDTO, userId: number, playerId: number | null | undefined) {
  return a.telegramUserId === userId || (playerId != null && a.playerId === playerId);
}

function applyLocal(
  list: AttendanceDTO[],
  userId: number,
  playerId: number | null,
  status: RsvpStatus,
  displayName: string,
): AttendanceDTO[] {
  if (list.some((a) => isMine(a, userId, playerId))) {
    return list.map((a) => (isMine(a, userId, playerId) ? { ...a, status } : a));
  }
  return [
    ...list,
    { id: -1, eventId: -1, telegramUserId: userId, displayName, playerId, status, updatedAt: new Date().toISOString() },
  ];
}

export function Rsvp({ event, showCounts = true }: { event: EventDTO; showCounts?: boolean }) {
  const { me, t } = useApp();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [pending, setPending] = useState(false);

  const myPlayerId = me.player?.id ?? null;
  const mine = event.attendance.find((a) => isMine(a, me.user.id, myPlayerId))?.status ?? null;
  const myName = me.player?.fullName ?? [me.user.first_name, me.user.last_name].filter(Boolean).join(" ");

  async function choose(status: RsvpStatus) {
    if (status === mine || pending) return;
    haptic("light");
    setPending(true);
    const patch = (e: EventDTO) => ({ ...e, attendance: applyLocal(e.attendance, me.user.id, myPlayerId, status, myName) });
    // Оптимістично — щоб кнопка відгукувалась одразу, ще до відповіді сервера.
    mutate(EVENTS_UPCOMING_KEY, (list?: EventDTO[]) => list?.map((e) => (e.id === event.id ? patch(e) : e)), {
      revalidate: false,
    });
    mutate(eventKey(event.id), (e?: EventDTO) => (e ? patch(e) : e), { revalidate: false });
    try {
      await api(`/api/events/${event.id}/rsvp`, { method: "POST", body: { status } });
      haptic("success");
    } catch (err) {
      toast(errorText(err), "error");
      haptic("error");
    } finally {
      setPending(false);
      mutate(EVENTS_UPCOMING_KEY);
      mutate(eventKey(event.id));
    }
  }

  const going = event.attendance.filter((a) => a.status === "going").length;
  const maybe = event.attendance.filter((a) => a.status === "maybe").length;

  return (
    <div>
      <Segmented
        value={mine}
        onChange={choose}
        options={RSVP_VALUES.map((s) => ({ value: s, label: t.rsvp[s], icon: RSVP_EMOJI[s] }))}
        tone={{ going: "going", maybe: "maybe", not_going: "not" }}
      />
      {showCounts && (
        <p className="mt-2 px-1 text-[14px] text-hint">
          {going === 0 && maybe === 0 ? t.rsvpSummary.nobody : t.rsvpSummary.going(going, maybe)}
        </p>
      )}
    </div>
  );
}
