"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import type { PlayerStatus, Position } from "@/db/schema";
import { api, type PlayerDTO } from "@/lib/client/api";
import { confirmDialog, haptic } from "@/lib/client/tg";
import { PLAYER_STATUS, POSITIONS } from "@/lib/positions";
import { Button, errorText, Field, Input, Segmented, Select, Sheet, Textarea, useToast } from "./ui";

type Form = {
  fullName: string;
  number: string;
  position: Position | "";
  status: PlayerStatus;
  telegramUsername: string;
  heightCm: string;
  note: string;
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
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [f, setForm] = useState<Form>(() => ({
    fullName: player?.fullName ?? "",
    number: player?.number != null ? String(player.number) : "",
    position: player?.position ?? "",
    status: player?.status ?? "active",
    telegramUsername: player?.telegramUsername ?? "",
    heightCm: player?.heightCm != null ? String(player.heightCm) : "",
    note: player?.note ?? "",
  }));
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((s) => ({ ...s, [k]: v }));
  const isEdit = !!player;
  const toInt = (s: string) => (s.trim() === "" ? null : Number(s));

  async function submit() {
    if (!f.fullName.trim()) {
      toast("Вкажіть ім'я гравця", "error");
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
      };
      if (player) await api(`/api/players/${player.id}`, { method: "PATCH", body });
      else await api("/api/players", { method: "POST", body });
      await mutate("/api/players");
      haptic("success");
      toast(isEdit ? "Зміни збережено" : "Гравця додано");
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
    if (!(await confirmDialog(`Видалити ${player.fullName} зі складу?`))) return;
    setSaving(true);
    try {
      await api(`/api/players/${player.id}`, { method: "DELETE" });
      await mutate("/api/players");
      toast("Гравця видалено");
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
      title={isEdit ? "Гравець" : "Новий гравець"}
      footer={
        <div className="flex gap-2">
          {isEdit && (
            <Button variant="danger" size="lg" onClick={remove} disabled={saving}>
              Видалити
            </Button>
          )}
          <Button variant="primary" size="lg" block onClick={submit} loading={saving}>
            {isEdit ? "Зберегти" : "Додати"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="grid grid-cols-[auto_1fr] gap-3">
          <Field label="Номер">
            <Input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              value={f.number}
              onChange={(e) => set("number", e.target.value.replace(/\D/g, ""))}
              className="numeral w-20 text-center text-[26px]"
              placeholder="—"
            />
          </Field>
          <Field label="Ім'я та прізвище">
            <Input
              value={f.fullName}
              onChange={(e) => set("fullName", e.target.value)}
              placeholder="Іван Петренко"
              autoFocus={!isEdit}
            />
          </Field>
        </div>

        <Field label="Позиція">
          <Select value={f.position} onChange={(e) => set("position", e.target.value as Position | "")}>
            <option value="">Не вказано</option>
            {POSITIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Статус">
          <Segmented value={f.status} onChange={(v) => set("status", v)} options={PLAYER_STATUS} />
        </Field>

        <Field label="Telegram" hint="Коли гравець натисне «Іду» або відкриє застосунок, бот прив’яже його сам.">
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

        <Field label="Зріст, см">
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

        <Field label="Нотатка">
          <Textarea value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Капітан, лівша…" />
        </Field>
      </div>
    </Sheet>
  );
}
