"use client";

import { useMemo, useState } from "react";
import { useSWRConfig } from "swr";
import type { EventType } from "@/db/schema";
import { api, isEventsKey, useCompetitions, useEvents, type EventDTO } from "@/lib/client/api";
import { haptic } from "@/lib/client/tg";
import { EVENT_TYPE_VALUES, options } from "@/lib/positions";
import { dateToLocalInput, defaultNewEventInput } from "@/lib/time";
import { useApp } from "./context";
import { Button, errorText, Field, Input, Segmented, Select, Sheet, Textarea, Toggle, useToast } from "./ui";

type Form = {
  type: EventType;
  startsAtLocal: string;
  opponent: string;
  competitionId: string; // "" | id | "__new"
  newCompetition: string;
  isHome: "none" | "home" | "away";
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
    isHome: e.isHome == null ? "none" : e.isHome ? "home" : "away",
    round: e.round ?? "",
    venueName: e.venueName ?? "",
    venueAddress: e.venueAddress ?? "",
    venueMapUrl: e.venueMapUrl ?? "",
    kit: e.kit ?? "",
    note: e.note ?? "",
    announceNow: false,
  };
}

/** Дефолти для нової події: ліга й зал з останньої доданої гри. */
function defaults(all: EventDTO[], tz: string, chatBound: boolean): Form {
  const lastGame = all.filter((e) => e.type === "game").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return {
    type: "game",
    startsAtLocal: defaultNewEventInput(tz),
    opponent: "",
    competitionId: lastGame?.competitionId ? String(lastGame.competitionId) : "",
    newCompetition: "",
    isHome: "none",
    round: "",
    venueName: lastGame?.venueName ?? "",
    venueAddress: lastGame?.venueAddress ?? "",
    venueMapUrl: lastGame?.venueMapUrl ?? "",
    kit: "",
    note: "",
    announceNow: chatBound,
  };
}

function EventFormInner({ onClose, event }: { onClose: () => void; event: EventDTO | null }) {
  const { tz, me, t } = useApp();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const competitions = useCompetitions();
  const upcoming = useEvents("upcoming");
  const past = useEvents("past");

  const allEvents = useMemo(() => [...(upcoming.data ?? []), ...(past.data ?? [])], [upcoming.data, past.data]);

  const [f, setForm] = useState<Form>(() =>
    event ? fromEvent(event, tz) : defaults(allEvents, tz, me.settings.chatBound),
  );
  const [more, setMore] = useState(() => !!(event?.venueMapUrl || event?.kit || event?.note || event?.isHome != null));
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
      toast(t.eventForm.errDate, "error");
      return;
    }
    if (isGame && f.competitionId === NEW && !f.newCompetition.trim()) {
      toast(t.eventForm.errNewCompetition, "error");
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
        isHome: isGame && f.isHome !== "none" ? f.isHome === "home" : null,
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
      if (isEdit) toast(t.common.changesSaved);
      else if ("announced" in saved && saved.announced === "sent") toast(t.eventForm.addedAnnounced);
      else toast(t.eventForm.added);
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
      title={isEdit ? t.eventForm.titleEdit : t.eventForm.titleNew}
      footer={
        <Button variant="primary" size="lg" block onClick={submit} loading={saving}>
          {isEdit ? t.common.saveChanges : isGame ? t.eventForm.addGame : t.eventForm.addTraining}
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <Segmented value={f.type} onChange={(v) => set("type", v)} options={options(EVENT_TYPE_VALUES, t.eventTypes)} />

        <Field label={t.eventForm.dateTime}>
          <Input
            type="datetime-local"
            value={f.startsAtLocal}
            onChange={(e) => set("startsAtLocal", e.target.value)}
            required
          />
        </Field>

        {isGame && (
          <>
            <Field label={t.eventForm.opponent}>
              <Input
                list="opponents"
                value={f.opponent}
                onChange={(e) => set("opponent", e.target.value)}
                placeholder={t.eventForm.opponentPh}
                autoComplete="off"
              />
              <datalist id="opponents">
                {opponents.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </Field>

            <Field label={t.eventForm.competition}>
              <Select value={f.competitionId} onChange={(e) => set("competitionId", e.target.value)}>
                <option value="">{t.eventForm.noCompetition}</option>
                {(competitions.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.season ? ` (${c.season})` : ""}
                  </option>
                ))}
                <option value={NEW}>{t.eventForm.newCompetition}</option>
              </Select>
              {f.competitionId === NEW && (
                <Input
                  className="mt-2"
                  value={f.newCompetition}
                  onChange={(e) => set("newCompetition", e.target.value)}
                  placeholder={t.eventForm.newCompetitionPh}
                  autoFocus
                />
              )}
            </Field>

            <Field label={t.eventForm.round}>
              <Input value={f.round} onChange={(e) => set("round", e.target.value)} placeholder={t.eventForm.roundPh} />
            </Field>
          </>
        )}

        <Field label={t.eventForm.venue}>
          <Input
            list="venues"
            value={f.venueName}
            onChange={(e) => pickVenue(e.target.value)}
            placeholder={t.eventForm.venuePh}
            autoComplete="off"
          />
          <datalist id="venues">
            {[...venues.keys()].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </Field>

        <Field label={t.eventForm.address}>
          <Input
            value={f.venueAddress}
            onChange={(e) => set("venueAddress", e.target.value)}
            placeholder={t.eventForm.addressPh}
          />
        </Field>

        {!more ? (
          <button type="button" onClick={() => setMore(true)} className="text-[15px] font-medium text-court">
            {t.eventForm.more}
          </button>
        ) : (
          <>
            <Field label={t.eventForm.mapUrl}>
              <Input
                type="url"
                inputMode="url"
                value={f.venueMapUrl}
                onChange={(e) => set("venueMapUrl", e.target.value)}
                placeholder="https://maps.google.com/…"
              />
            </Field>
            <Field label={t.eventForm.kit}>
              <Input value={f.kit} onChange={(e) => set("kit", e.target.value)} placeholder={t.eventForm.kitPh} />
            </Field>
            <Field label={t.eventForm.note}>
              <Textarea value={f.note} onChange={(e) => set("note", e.target.value)} placeholder={t.eventForm.notePh} />
            </Field>
            {isGame && (
              <Field label={t.eventForm.homeAway} hint={t.eventForm.homeAwayHint}>
                <Segmented
                  value={f.isHome}
                  onChange={(v) => set("isHome", v)}
                  options={[
                    { value: "none", label: t.common.notSet },
                    { value: "home", label: t.eventForm.home },
                    { value: "away", label: t.eventForm.away },
                  ]}
                />
              </Field>
            )}
          </>
        )}

        {!isEdit && me.settings.chatBound && (
          <Toggle
            checked={f.announceNow}
            onChange={(v) => set("announceNow", v)}
            label={t.eventForm.announceNow}
            hint={t.eventForm.announceNowHint}
          />
        )}
      </div>
    </Sheet>
  );
}
