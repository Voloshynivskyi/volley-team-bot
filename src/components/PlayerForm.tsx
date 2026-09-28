"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import type { PlayerStatus, Position } from "@/db/schema";
import { api, type PlayerDTO } from "@/lib/client/api";
import { confirmDialog, haptic } from "@/lib/client/tg";
import { options, PLAYER_STATUS_VALUES, POSITION_VALUES } from "@/lib/positions";
import { useApp } from "./context";
import { Button, errorText, Field, Input, Segmented, Select, Sheet, Textarea, Toggle, useToast } from "./ui";

type Form = {
  fullName: string;
  number: string;
  position: Position | "";
  status: PlayerStatus;
  telegramUsername: string;
  heightCm: string;
  note: string;
  linkMe: boolean;
};

export default function PlayerForm({
  open,
  onClose,
  player,
}: {
  open: boolean;
  onClose: () => void;
  player: PlayerDTO | null;
}) {
  if (!open) return null;
  return <PlayerFormInner onClose={onClose} player={player} />;
}

function PlayerFormInner({ onClose, player }: { onClose: () => void; player: PlayerDTO | null }) {
  const { me, t, isAdmin } = useApp();
  const toast = useToast();
  const { mutate } = useSWRConfig();

  const isEdit = !!player;
  const isMine = player != null && player.telegramUserId === me.user.id;
  // "Це я" пропонуємо тому, хто ще не прив'язаний, і лише для вільної картки.
  const canLinkMe = !me.player && player?.telegramUserId == null;

  const [f, setForm] = useState<Form>(() => ({
    fullName: player?.fullName ?? "",
    number: player?.number != null ? String(player.number) : "",
    position: player?.position ?? "",
    status: player?.status ?? "active",
    telegramUsername: player?.telegramUsername ?? "",
    heightCm: player?.heightCm != null ? String(player.heightCm) : "",
    note: player?.note ?? "",
    // Учасник, що додає нову картку без власної, найчастіше додає себе.
    linkMe: canLinkMe && !isEdit && !isAdmin,
  }));
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((s) => ({ ...s, [k]: v }));
  const toInt = (s: string) => (s.trim() === "" ? null : Number(s));

  function toggleLinkMe(on: boolean) {
    setForm((s) => ({
      ...s,
      linkMe: on,
      telegramUsername: on && !s.telegramUsername && me.user.username ? me.user.username : s.telegramUsername,
    }));
  }

  async function submit() {
    if (!f.fullName.trim()) {
      toast(t.playerForm.errName, "error");
      return;
    }
    setSaving(true);
    try {
      const body = {
        fullName: f.fullName,
        number: toInt(f.number),
        position: f.position || null,
        status: f.status,
        telegramUsername: f.telegramUsername,
        heightCm: toInt(f.heightCm),
        note: f.note,
        linkMe: canLinkMe && f.linkMe,
      };
      if (player) await api(`/api/players/${player.id}`, { method: "PATCH", body });
      else await api("/api/players", { method: "POST", body });
      // Після "Це я" змінюється і картка в складі, і "мій гравець" у профілі.
      await Promise.all([mutate("/api/players"), body.linkMe ? mutate("/api/me") : null]);
      haptic("success");
      toast(isEdit ? t.common.changesSaved : t.playerForm.added);
      onClose();
    } catch (err) {
      toast(errorText(err), "error");
      haptic("error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!player) return;
    if (!(await confirmDialog(t.playerForm.deleteConfirm(player.fullName)))) return;
    setSaving(true);
    try {
      await api(`/api/players/${player.id}`, { method: "DELETE" });
      await mutate("/api/players");
      toast(t.playerForm.deleted);
      onClose();
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={isMine ? t.playerForm.titleMine : isEdit ? t.playerForm.titleEdit : t.playerForm.titleNew}
      footer={
        <div className="flex gap-2">
          {isEdit && isAdmin && (
            <Button variant="danger" size="lg" onClick={remove} disabled={saving}>
              {t.common.delete}
            </Button>
          )}
          <Button variant="primary" size="lg" block onClick={submit} loading={saving}>
            {isEdit ? t.common.save : t.common.add}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        {canLinkMe && (
          <div className="rounded-2xl bg-surface px-4 py-1">
            <Toggle checked={f.linkMe} onChange={toggleLinkMe} label={t.playerForm.itsMe} hint={t.playerForm.itsMeHint} />
          </div>
        )}

        <Field label={t.playerForm.fullName}>
          <Input
            value={f.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            placeholder={t.playerForm.fullNamePh}
            autoFocus={!isEdit}
          />
        </Field>

        <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
          <Field label={t.playerForm.number}>
            <Input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              value={f.number}
              onChange={(e) => set("number", e.target.value.replace(/\D/g, ""))}
              className="numeral w-full px-1 text-center text-[24px]"
              placeholder="—"
            />
          </Field>
          <Field label={t.playerForm.position}>
            <Select value={f.position} onChange={(e) => set("position", e.target.value as Position | "")}>
              <option value="">{t.common.notSet}</option>
              {POSITION_VALUES.map((p) => (
                <option key={p} value={p}>
                  {t.positions[p].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t.playerForm.status}>
          <Segmented
            value={f.status}
            onChange={(v) => set("status", v)}
            options={options(PLAYER_STATUS_VALUES, t.playerStatus)}
          />
        </Field>

        <Field label={t.playerForm.telegram} hint={t.playerForm.telegramHint}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-hint">@</span>
            <Input
              value={f.telegramUsername}
              onChange={(e) => set("telegramUsername", e.target.value.replace(/^@/, ""))}
              placeholder="username"
              autoCapitalize="none"
              autoCorrect="off"
              className="pl-8"
            />
          </div>
        </Field>

        <Field label={t.playerForm.height}>
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            value={f.heightCm}
            onChange={(e) => set("heightCm", e.target.value.replace(/\D/g, ""))}
            className="w-28"
            placeholder="190"
          />
        </Field>

        <Field label={t.playerForm.note}>
          <Textarea value={f.note} onChange={(e) => set("note", e.target.value)} placeholder={t.playerForm.notePh} />
        </Field>
      </div>
    </Sheet>
  );
}
