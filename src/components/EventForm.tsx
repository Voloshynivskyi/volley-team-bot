"use client";

import { useMemo, useState } from "react";
import { useSWRConfig } from "swr";
import type { EventType } from "@/db/schema";
import { api, isEventsKey, useCompetitions, useEvents, type EventDTO } from "@/lib/client/api";
import { haptic } from "@/lib/client/tg";
import { EVENT_TYPES } from "@/lib/positions";
import { dateToLocalInput, defaultNewEventInput } from "@/lib/time";
import { useApp } from "./context";
import { Button, errorText, Field, Input, Segmented, Select, Sheet, Textarea, Toggle, useToast } from "./ui";

type Form = {
  type: EventType;
  startsAtLocal: string;
  opponent: string;
  competitionId: string; // "" | id | "__new"
  newCompetition: string;
  isHome: "home" | "away";
  round: string;
  venueName: string;
  venueAddress: string;
  venueMapUrl: string;
  kit: string;
  note: string;
  announceNow: boolean;
};

const NEW = "__new";

/** Форма монтується лише коли відкрита — стан ініціалізується один раз при відкритті. */
export default function EventForm({
  open,
  onClose,
  event,
}: {
  open: boolean;
  onClose: () => void;
  event?: EventDTO | null;
}) {
  if (!open) return null;
  return <EventFormInner onClose={onClose} event={event ?? null} />;
}

function fromEvent(e: EventDTO, tz: string): Form {
  return {
    type: e.type,
    startsAtLocal: dateToLocalInput(new Date(e.startsAt), tz),
    opponent: e.opponent ?? "",
    competitionId: e.competitionId ? String(e.competitionId) : "",
    newCompetition: "",
    isHome: e.isHome === false ? "away" : "home",
    round: e.round ?? "",
    venueName: e.venueName ?? "",
    venueAddress: e.venueAddress ?? "",
    venueMapUrl: e.venueMapUrl ?? "",
    kit: e.kit ?? "",
    note: e.note ?? "",
    announceNow: false,
  };
}

/** Дефолти для нової події: ліга з останньої гри, зал з останньої домашньої. */
function defaults(all: EventDTO[], tz: string, chatBound: boolean): Form {
  const lastGame = all.filter((e) => e.type === "game").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const lastHome = all.find((e) => e.isHome && e.venueName);
  return {
    type: "game",
    startsAtLocal: defaultNewEventInput(tz),
    opponent: "",
    competitionId: lastGame?.competitionId ? String(lastGame.competitionId) : "",
    newCompetition: "",
    isHome: "home",
    round: "",
    venueName: lastHome?.venueName ?? "",
    venueAddress: lastHome?.venueAddress ?? "",
    venueMapUrl: lastHome?.venueMapUrl ?? "",
    kit: "",
    note: "",
    announceNow: chatBound,
  };
}

function EventFormInner({ onClose, event }: { onClose: () => void; event: EventDTO | null }) {
  const { tz, me } = useApp();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const competitions = useCompetitions();
  const upcoming = useEvents("upcoming");
  const past = useEvents("past");

  const allEvents = useMemo(() => [...(upcoming.data ?? []), ...(past.data ?? [])], [upcoming.data, past.data]);

  const [f, setForm] = useState<Form>(() =>
    event ? fromEvent(event, tz) : defaults(allEvents, tz, me.settings.chatBound),
  );
  const [more, setMore] = useState(() => !!(event?.venueMapUrl || event?.kit || event?.note));
  const [saving, setSaving] = useState(false);

  // Підказки з попередніх подій: суперники та зали з адресами.
  const opponents = useMemo(
    () =>
      [...new Set(allEvents.map((e) => e.opponent).filter((x): x is string => !!x))].sort((a, b) =>
        a.localeCompare(b, "uk"),
      ),
    [allEvents],
  );
  const venues = useMemo(() => {
    const map = new Map<string, { address: string; mapUrl: string }>();
    for (const e of [...allEvents].sort((a, b) => b.startsAt.localeCompare(a.startsAt))) {
      if (e.venueName && !map.has(e.venueName)) {
        map.set(e.venueName, { address: e.venueAddress ?? "", mapUrl: e.venueMapUrl ?? "" });
      }
    }
    return map;
  }, [allEvents]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((s) => ({ ...s, [k]: v }));
  const isGame = f.type === "game";
  const isEdit = !!event;

  function pickVenue(name: string) {
    const known = venues.get(name);
    setForm((s) =>
      known ? { ...s, venueName: name, venueAddress: known.address, venueMapUrl: known.mapUrl } : { ...s, venueName: name },
    );
  }

  async function submit() {
    if (!f.startsAtLocal) {
      toast("Вкажіть дату й час", "error");
      return;
    }
    if (isGame && f.competitionId === NEW && !f.newCompetition.trim()) {
      toast("Вкажіть назву нової ліги", "error");
      return;
    }
    setSaving(true);
    try {
      let competitionId: number | null = f.competitionId && f.competitionId !== NEW ? Number(f.competitionId) : null;
      if (isGame && f.competitionId === NEW) {
        const created = await api<{ id: number }>("/api/competitions", {
          method: "POST",
          body: { name: f.newCompetition.trim(), type: "league" },
        });
        competitionId = created.id;
        await mutate("/api/competitions");
      }
      const body = {
        type: f.type,
        startsAtLocal: f.startsAtLocal,
        opponent: isGame ? f.opponent : null,
        competitionId: isGame ? competitionId : null,
        isHome: isGame ? f.isHome === "home" : null,
        round: isGame ? f.round : null,
        venueName: f.venueName,
        venueAddress: f.venueAddress,
        venueMapUrl: f.venueMapUrl,
        kit: f.kit,
        note: f.note,
        announceNow: !isEdit && f.announceNow,
      };
      const saved = isEdit
        ? await api<EventDTO>(`/api/events/${event.id}`, { method: "PATCH", body })
        : await api<EventDTO & { announced: string | null }>("/api/events", { method: "POST", body });
      await mutate(isEventsKey);
      haptic("success");
      if (isEdit) toast("Зміни збережено");
      else if ("announced" in saved && saved.announced === "sent") toast("Додано й анонсовано в треді");
      else toast("Подію додано");
      onClose();
    } catch (err) {
      toast(errorText(err), "error");
      haptic("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={isEdit ? "Редагувати подію" : "Нова подія"}
      footer={
        <Button variant="primary" size="lg" block onClick={submit} loading={saving}>
          {isEdit ? "Зберегти зміни" : isGame ? "Додати гру" : "Додати тренування"}
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <Segmented value={f.type} onChange={(v) => set("type", v)} options={EVENT_TYPES} />

        <Field label="Дата й час">
          <Input
            type="datetime-local"
            value={f.startsAtLocal}
            onChange={(e) => set("startsAtLocal", e.target.value)}
            required
          />
        </Field>

        {isGame && (
          <>
            <Field label="Суперник">
              <Input
                list="opponents"
                value={f.opponent}
                onChange={(e) => set("opponent", e.target.value)}
                placeholder="Назва команди"
                autoComplete="off"
              />
              <datalist id="opponents">
                {opponents.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </Field>

            <Field label="Ліга або турнір">
              <Select value={f.competitionId} onChange={(e) => set("competitionId", e.target.value)}>
                <option value="">Без ліги</option>
                {(competitions.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.season ? ` (${c.season})` : ""}
                  </option>
                ))}
                <option value={NEW}>+ Нова ліга…</option>
              </Select>
              {f.competitionId === NEW && (
                <Input
                  className="mt-2"
                  value={f.newCompetition}
                  onChange={(e) => set("newCompetition", e.target.value)}
                  placeholder="Назва ліги"
                  autoFocus
                />
              )}
            </Field>

            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <Field label="Де граємо">
                <Segmented
                  value={f.isHome}
                  onChange={(v) => set("isHome", v)}
                  options={[
                    { value: "home", label: "Дома" },
                    { value: "away", label: "Виїзд" },
                  ]}
                />
              </Field>
              <Field label="Тур">
                <Input value={f.round} onChange={(e) => set("round", e.target.value)} placeholder="3 тур" className="w-24" />
              </Field>
            </div>
          </>
        )}

        <Field label="Зал">
          <Input
            list="venues"
            value={f.venueName}
            onChange={(e) => pickVenue(e.target.value)}
            placeholder="Назва залу"
            autoComplete="off"
          />
          <datalist id="venues">
            {[...venues.keys()].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </Field>

        <Field label="Адреса">
          <Input value={f.venueAddress} onChange={(e) => set("venueAddress", e.target.value)} placeholder="Місто, вулиця" />
        </Field>

        {!more ? (
          <button type="button" onClick={() => setMore(true)} className="text-[15px] font-medium text-court">
            Більше: мапа, форма, нотатка
          </button>
        ) : (
          <>
            <Field label="Посилання на мапу">
              <Input
                type="url"
                inputMode="url"
                value={f.venueMapUrl}
                onChange={(e) => set("venueMapUrl", e.target.value)}
                placeholder="https://maps.google.com/…"
              />
            </Field>
            <Field label="Форма">
              <Input value={f.kit} onChange={(e) => set("kit", e.target.value)} placeholder="Світла / темна" />
            </Field>
            <Field label="Нотатка">
              <Textarea value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Збір за 40 хв до початку" />
            </Field>
          </>
        )}

        {!isEdit && me.settings.chatBound && (
          <Toggle
            checked={f.announceNow}
            onChange={(v) => set("announceNow", v)}
            label="Одразу написати анонс у тред"
            hint="Інакше бот анонсує сам за кілька днів до події"
          />
        )}
      </div>
    </Sheet>
  );
}
