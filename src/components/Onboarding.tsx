"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { api, usePlayers, type PlayerDTO } from "@/lib/client/api";
import { confirmDialog, haptic } from "@/lib/client/tg";
import { positionLabel } from "@/lib/positions";
import { useApp } from "./context";
import PlayerForm from "./PlayerForm";
import { Button, errorText, Row, Sheet, useToast } from "./ui";

const keyFor = (userId: number) => `onboarding-dismissed:${userId}`;

function wasDismissed(userId: number): boolean {
  try {
    return localStorage.getItem(keyFor(userId)) === "1";
  } catch {
    return false;
  }
}

/**
 * "Хто ви?" — при першому відкритті учасник без картки обирає себе в складі.
 * Тоді його кнопки "Іду" одразу рахуються за правильним гравцем.
 */
export default function Onboarding() {
  const { me, t, canEditPlayers } = useApp();
  const { data: players } = usePlayers();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [dismissed, setDismissed] = useState(() => wasDismissed(me.user.id));
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const dismiss = () => {
    try {
      localStorage.setItem(keyFor(me.user.id), "1");
    } catch {
      /* лишається до перезапуску */
    }
    setDismissed(true);
  };

  const show = canEditPlayers && !me.player && !dismissed && !!players && !addOpen;
  const free = (players ?? []).filter((p) => p.telegramUserId == null);

  async function pick(p: PlayerDTO) {
    if (!(await confirmDialog(t.onboarding.confirm(p.fullName)))) return;
    setBusyId(p.id);
    try {
      await api(`/api/players/${p.id}`, { method: "PATCH", body: { linkMe: true } });
      await Promise.all([mutate("/api/me"), mutate("/api/players")]);
      haptic("success");
      toast(t.onboarding.done(p.fullName));
      dismiss();
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Sheet
        open={show}
        onClose={dismiss}
        title={t.onboarding.title}
        footer={
          <div className="flex gap-2">
            <Button size="lg" onClick={dismiss}>
              {t.onboarding.later}
            </Button>
            <Button variant="primary" size="lg" block onClick={() => setAddOpen(true)}>
              {t.onboarding.notInList}
            </Button>
          </div>
        }
      >
        <p className="mb-3 text-[15px] text-hint">{t.onboarding.text}</p>
        {free.length ? (
          <div className="overflow-hidden rounded-2xl bg-surface">
            {free.map((p) => (
              <Row key={p.id} onClick={() => pick(p)} className={busyId === p.id ? "opacity-50" : ""}>
                <div className="numeral w-10 shrink-0 text-center text-[26px]">{p.number ?? "–"}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-medium">{p.fullName}</p>
                  <p className="truncate text-[13px] text-hint">{positionLabel(t, p.position)}</p>
                </div>
              </Row>
            ))}
          </div>
        ) : (
          <p className="text-[15px]">{t.onboarding.empty}</p>
        )}
      </Sheet>
      <PlayerForm
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          dismiss();
        }}
        player={null}
        defaultLinkMe
      />
    </>
  );
}
