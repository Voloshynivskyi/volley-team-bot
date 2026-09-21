"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { api, isEventsKey, useEvent, type EventDTO } from "@/lib/client/api";
import { confirmDialog, haptic, openLink } from "@/lib/client/tg";
import { fmtDayLong, fmtTime } from "@/lib/time";
import { ucFirst } from "@/lib/text";
import { useApp } from "./context";
import EventForm from "./EventForm";
import { Rsvp } from "./Rsvp";
import { Button, errorText, Input, Sheet, Spinner, useToast } from "./ui";

export default function EventDetails({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { tz, isAdmin, me } = useApp();
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
      toast(status === "cancelled" ? "Подію скасовано" : "Подію відновлено");
    });

  const remove = async () => {
    if (!(await confirmDialog("Видалити подію разом із явкою? Повідомлення в треді залишаться."))) return;
    await run("delete", async () => {
      await api(`/api/events/${id}`, { method: "DELETE" });
      await refresh();
      toast("Подію видалено");
      onClose();
    });
  };

  const title = !e ? "" : e.type === "game" ? (e.opponent ?? "Суперник уточнюється") : "Тренування";

  return (
    <Sheet open={id != null} onClose={onClose} title={e ? (e.type === "game" ? "Гра" : "Тренування") : "Подія"}>
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
              <p className="text-[15px] text-hint">{[e.competition?.name, e.round].filter(Boolean).join(", ")}</p>
            )}
            <h3 className="font-cond text-[40px] font-bold leading-none tracking-tight">{title}</h3>
            {e.status === "cancelled" && <p className="mt-2 font-medium text-not">Скасовано</p>}
          </div>

          <DateBlock event={e} tz={tz} />

          {e.status === "finished" && e.scoreUs != null && e.scoreThem != null && (
            <div className="rounded-2xl bg-surface p-4 text-center">
              <p className={`numeral text-[48px] ${e.scoreUs > e.scoreThem ? "text-going" : "text-not"}`}>
                {e.scoreUs}:{e.scoreThem}
              </p>
              <p className="mt-1 text-[15px] text-hint">{e.scoreUs > e.scoreThem ? "Перемога" : "Поразка"}</p>
            </div>
          )}

          <InfoList event={e} />

          {e.status === "scheduled" && (
            <div className="rounded-2xl bg-surface p-4">
              <Rsvp event={e} showCounts={false} />
              <AttendanceLists event={e} myId={me.user.id} />
            </div>
          )}

          {isAdmin && (
            <div className="space-y-2">
              <p className="px-1 text-[14px] font-medium text-hint">Керування</p>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => setEditOpen(true)}>Редагувати</Button>
                {e.status === "scheduled" && (
                  <Button onClick={announce} loading={busy === "announce"} disabled={!me.settings.chatBound}>
                    Анонс у тред
                  </Button>
                )}
                {e.type === "game" && e.status !== "cancelled" && (
                  <Button onClick={() => setResultOpen((v) => !v)}>
                    {e.status === "finished" ? "Змінити рахунок" : "Записати рахунок"}
                  </Button>
                )}
                {e.status === "cancelled" ? (
                  <Button onClick={() => setStatus("scheduled")} loading={busy === "status"}>
                    Відновити
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => setStatus("cancelled")} loading={busy === "status"}>
                    Скасувати подію
                  </Button>
                )}
                <Button variant="danger" onClick={remove} loading={busy === "delete"}>
                  Видалити
                </Button>
              </div>
              {!me.settings.chatBound && e.status === "scheduled" && (
                <p className="px-1 text-[13px] text-hint">
                  Щоб анонсувати, додайте бота в групу й надішліть /here у потрібному треді.
                </p>
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

function DateBlock({ event: e, tz }: { event: EventDTO; tz: string }) {
  const d = new Date(e.startsAt);
  return (
    <div className="flex items-end justify-between gap-4 rounded-2xl bg-surface px-4 py-3">
      <div>
        <p className="text-[17px] font-medium">{ucFirst(fmtDayLong(d, tz))}</p>
        <p className="text-[14px] text-hint">{d.getFullYear()}</p>
      </div>
      <p className="numeral text-[44px]">{fmtTime(d, tz)}</p>
    </div>
  );
}

function InfoList({ event: e }: { event: EventDTO }) {
  const rows: { icon: string; text: string; onClick?: () => void }[] = [];
  const where = [e.venueName, e.venueAddress].filter(Boolean).join(", ");
  const side = e.type === "game" && e.isHome != null ? (e.isHome ? "дома" : "виїзд") : null;
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
    rows.push({ icon: "📊", text: "Таблиця ліги", onClick: () => openLink(e.competition!.standingsUrl!) });
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

function AttendanceLists({ event: e, myId }: { event: EventDTO; myId: number }) {
  const groups = [
    { key: "going", title: "Ідуть", cls: "text-going" },
    { key: "maybe", title: "Можливо", cls: "text-maybe" },
    { key: "not_going", title: "Не йдуть", cls: "text-not" },
  ] as const;
  const any = e.attendance.length > 0;
  if (!any) return <p className="mt-3 text-[14px] text-hint">Ніхто ще не відмітився. Будьте першим.</p>;
  return (
    <div className="mt-4 space-y-3">
      {groups.map((g) => {
        const list = e.attendance.filter((a) => a.status === g.key);
        if (!list.length) return null;
        return (
          <div key={g.key}>
            <p className={`text-[14px] font-medium ${g.cls}`}>
              {g.title} <span className="numeral text-[16px]">{list.length}</span>
            </p>
            <p className="mt-0.5 text-[15px] leading-relaxed">
              {list.map((a, i) => (
                <span key={a.telegramUserId}>
                  {i > 0 && ", "}
                  <span className={a.telegramUserId === myId ? "font-medium" : ""}>{a.displayName}</span>
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
  const toast = useToast();
  const [us, setUs] = useState(e.scoreUs != null ? String(e.scoreUs) : "");
  const [them, setThem] = useState(e.scoreThem != null ? String(e.scoreThem) : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    const a = Number(us);
    const b = Number(them);
    if (!Number.isInteger(a) || !Number.isInteger(b) || us === "" || them === "") {
      toast("Вкажіть рахунок по сетах, напр. 3 і 1", "error");
      return;
    }
    setSaving(true);
    try {
      await api(`/api/events/${e.id}`, { method: "PATCH", body: { scoreUs: a, scoreThem: b, status: "finished" } });
      toast("Рахунок збережено");
      await onDone();
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl bg-surface p-4">
      <p className="mb-3 text-[14px] text-hint">Рахунок по сетах</p>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <span className="mb-1 block text-[13px] text-hint">Ми</span>
          <Input inputMode="numeric" pattern="[0-9]*" maxLength={1} value={us} onChange={(ev) => setUs(ev.target.value)} className="numeral text-center text-[24px]" />
        </div>
        <span className="numeral pt-5 text-[28px] text-hint">:</span>
        <div className="flex-1">
          <span className="mb-1 block text-[13px] text-hint">{e.opponent ?? "Суперник"}</span>
          <Input inputMode="numeric" pattern="[0-9]*" maxLength={1} value={them} onChange={(ev) => setThem(ev.target.value)} className="numeral text-center text-[24px]" />
        </div>
      </div>
      <Button variant="primary" block className="mt-3" onClick={save} loading={saving}>
        Зберегти рахунок
      </Button>
    </div>
  );
}
