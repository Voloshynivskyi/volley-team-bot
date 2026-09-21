"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import type { RsvpStatus } from "@/db/schema";
import { api, EVENTS_UPCOMING_KEY, eventKey, type AttendanceDTO, type EventDTO } from "@/lib/client/api";
import { haptic } from "@/lib/client/tg";
import { RSVP } from "@/lib/positions";
import { useApp } from "./context";
import { errorText, Segmented, useToast } from "./ui";

function applyLocal(list: AttendanceDTO[], userId: number, status: RsvpStatus, displayName: string): AttendanceDTO[] {
  const existing = list.find((a) => a.telegramUserId === userId);
  if (existing) return list.map((a) => (a.telegramUserId === userId ? { ...a, status } : a));
  return [
    ...list,
    {
      id: -1,
      eventId: -1,
      telegramUserId: userId,
      displayName,
      playerId: null,
      status,
      updatedAt: new Date().toISOString(),
    },
  ];
}

export function Rsvp({ event, showCounts = true }: { event: EventDTO; showCounts?: boolean }) {
  const { me } = useApp();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [pending, setPending] = useState(false);

  const mine = event.attendance.find((a) => a.telegramUserId === me.user.id)?.status ?? null;
  const myName = me.player?.fullName ?? [me.user.first_name, me.user.last_name].filter(Boolean).join(" ");

  async function choose(status: RsvpStatus) {
    if (status === mine || pending) return;
    haptic("light");
    setPending(true);
    const patch = (e: EventDTO) => ({ ...e, attendance: applyLocal(e.attendance, me.user.id, status, myName) });
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
        options={RSVP.map((r) => ({ value: r.value, label: r.label, icon: r.emoji }))}
        tone={{ going: "going", maybe: "maybe", not_going: "not" }}
      />
      {showCounts && (
        <p className="mt-2 px-1 text-[14px] text-hint">
          {going === 0 && maybe === 0
            ? "Ніхто ще не відмітився"
            : `Ідуть ${going}${maybe ? `, можливо ${maybe}` : ""}`}
        </p>
      )}
    </div>
  );
}
