"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import type { CompetitionType } from "@/db/schema";
import { api, useCompetitions, useSettings, type CompetitionDTO, type SettingsDTO } from "@/lib/client/api";
import { confirmDialog, haptic } from "@/lib/client/tg";
import { COMPETITION_TYPES } from "@/lib/positions";
import { useApp } from "./context";
import { Button, errorText, Field, Input, Row, Section, Segmented, Sheet, Spinner, Toggle, useToast } from "./ui";

export default function Manage() {
  const { me } = useApp();
  return (
    <>
      <header className="px-5 pb-3 pt-5">
        <h1 className="text-[24px] font-semibold leading-tight">Керування</h1>
        <p className="text-[15px] text-hint">Ви адміністратор — можете редагувати все.</p>
      </header>
      <div className="space-y-6">
        <GroupSection />
        <CompetitionsSection />
        <SettingsSection />
        <Section title="Команди бота в чаті">
          <div className="space-y-2 px-4 py-3 text-[15px]">
            <p>
              <code className="text-court">/next</code> — найближча подія з кнопками явки
            </p>
            <p>
              <code className="text-court">/schedule</code> — найближчі 10 подій
            </p>
            <p>
              <code className="text-court">/roster</code> — склад
            </p>
            <p>
              <code className="text-court">/here</code> — прив’язати тред для анонсів (у групі)
            </p>
            {me.settings.chatBound && (
              <p className="pt-1 text-hint">
                Анонс — за {me.settings.announceDaysBefore} дн. до події, нагадування — за {me.settings.reminderHours} год.
              </p>
            )}
          </div>
        </Section>
      </div>
    </>
  );
}

function GroupSection() {
  const { me } = useApp();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const s = me.settings;

  async function unbind() {
    if (!(await confirmDialog("Відв'язати групу? Бот перестане писати анонси, поки не отримає /here знову."))) return;
    setBusy(true);
    try {
      await api("/api/settings", { method: "DELETE" });
      await mutate("/api/me");
      toast("Групу відв'язано");
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Група для анонсів">
      <div className="px-4 py-3">
        {s.chatBound ? (
          <>
            <p className="text-[16px] font-medium">{s.chatTitle ?? "Група прив’язана"}</p>
            <p className="text-[14px] text-hint">{s.threadId ? "Пише в окремий тред" : "Пише в загальний чат групи"}</p>
            <Button variant="ghost" className="mt-2 -ml-4" onClick={unbind} loading={busy}>
              Відв’язати
            </Button>
          </>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-[15px]">
            <li>Додайте бота в групу команди і зробіть його адміністратором.</li>
            <li>Відкрийте тред, куди мають приходити анонси.</li>
            <li>
              Надішліть там <code className="text-court">/here</code>.
            </li>
          </ol>
        )}
      </div>
    </Section>
  );
}

function CompetitionsSection() {
  const { data, isLoading } = useCompetitions(true);
  const [editing, setEditing] = useState<CompetitionDTO | null | "new">(null);
  const active = (data ?? []).filter((c) => !c.isArchived);
  const archived = (data ?? []).filter((c) => c.isArchived);

  return (
    <>
      <Section
        title="Ліги й турніри"
        action={
          <button type="button" onClick={() => setEditing("new")} className="text-[15px] font-medium text-court">
            + Додати
          </button>
        }
      >
        {isLoading && (
          <div className="flex justify-center py-6 text-hint">
            <Spinner small />
          </div>
        )}
        {!isLoading && !data?.length && (
          <p className="px-4 py-4 text-[15px] text-hint">Поки немає. Додайте лігу, щоб обирати її при створенні гри.</p>
        )}
        {active.map((c) => (
          <CompetitionRow key={c.id} c={c} onClick={() => setEditing(c)} />
        ))}
        {archived.map((c) => (
          <CompetitionRow key={c.id} c={c} onClick={() => setEditing(c)} muted />
        ))}
      </Section>
      {editing !== null && (
        <CompetitionForm onClose={() => setEditing(null)} competition={editing === "new" ? null : editing} />
      )}
    </>
  );
}

function CompetitionRow({ c, onClick, muted }: { c: CompetitionDTO; onClick: () => void; muted?: boolean }) {
  const type = COMPETITION_TYPES.find((t) => t.value === c.type)?.label ?? "";
  return (
    <Row onClick={onClick} className={muted ? "opacity-50" : ""}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-medium">{c.name}</p>
        <p className="text-[13px] text-hint">{[type, c.season, muted ? "в архіві" : null].filter(Boolean).join(", ")}</p>
      </div>
      <span className="text-hint" aria-hidden>
        ›
      </span>
    </Row>
  );
}

function CompetitionForm({ onClose, competition }: { onClose: () => void; competition: CompetitionDTO | null }) {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [name, setName] = useState(competition?.name ?? "");
  const [type, setType] = useState<CompetitionType>(competition?.type ?? "league");
  const [season, setSeason] = useState(competition?.season ?? "");
  const [url, setUrl] = useState(competition?.standingsUrl ?? "");
  const [archived, setArchived] = useState(competition?.isArchived ?? false);
  const [saving, setSaving] = useState(false);

  const refresh = () => Promise.all([mutate("/api/competitions"), mutate("/api/competitions?all=1")]);

  async function submit() {
    if (!name.trim()) {
      toast("Вкажіть назву", "error");
      return;
    }
    setSaving(true);
    try {
      const body = { name, type, season, standingsUrl: url, isArchived: archived };
      if (competition) await api(`/api/competitions/${competition.id}`, { method: "PATCH", body });
      else await api("/api/competitions", { method: "POST", body });
      await refresh();
      haptic("success");
      toast(competition ? "Збережено" : "Лігу додано");
      onClose();
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!competition) return;
    if (!(await confirmDialog(`Видалити «${competition.name}»? Ігри залишаться, але без ліги.`))) return;
    setSaving(true);
    try {
      await api(`/api/competitions/${competition.id}`, { method: "DELETE" });
      await refresh();
      toast("Лігу видалено");
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
      title={competition ? "Ліга" : "Нова ліга"}
      footer={
        <div className="flex gap-2">
          {competition && (
            <Button variant="danger" size="lg" onClick={remove} disabled={saving}>
              Видалити
            </Button>
          )}
          <Button variant="primary" size="lg" block onClick={submit} loading={saving}>
            {competition ? "Зберегти" : "Додати"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <Field label="Назва">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Чемпіонат міста" autoFocus={!competition} />
        </Field>
        <Field label="Тип">
          <Segmented value={type} onChange={setType} options={COMPETITION_TYPES} />
        </Field>
        <Field label="Сезон">
          <Input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2026/27" className="w-32" />
        </Field>
        <Field label="Посилання на таблицю">
          <Input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
        {competition && (
          <Toggle checked={archived} onChange={setArchived} label="В архіві" hint="Не показувати при створенні нових ігор" />
        )}
      </div>
    </Sheet>
  );
}

function SettingsSection() {
  const { data } = useSettings(true);
  return (
    <Section title="Налаштування">
      {data ? (
        // key — щоб форма перечиталась після збереження на іншому пристрої
        <SettingsForm key={data.updatedAt} initial={data} />
      ) : (
        <div className="flex justify-center py-6 text-hint">
          <Spinner small />
        </div>
      )}
    </Section>
  );
}

const COMMON_TZ = ["Europe/Kyiv", "Europe/Warsaw", "Europe/Berlin", "Europe/London", "Europe/Lisbon", "America/New_York"];

function SettingsForm({ initial }: { initial: SettingsDTO }) {
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [teamName, setTeamName] = useState(initial.teamName);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [reminderHours, setReminderHours] = useState(initial.reminderHours);
  const [announceDays, setAnnounceDays] = useState(String(initial.announceDaysBefore));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: { teamName, timezone, reminderHours, announceDaysBefore: Number(announceDays) || 0 },
      });
      await Promise.all([mutate("/api/settings"), mutate("/api/me")]);
      haptic("success");
      toast("Налаштування збережено");
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <Field label="Назва команди">
        <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} />
      </Field>
      <Field label="Часовий пояс" hint="Усі дати в застосунку й повідомленнях бота показуються в цьому поясі.">
        <Input list="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} autoComplete="off" />
        <datalist id="tz">
          {COMMON_TZ.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Нагадувати за, год" hint="Через кому">
          <Input value={reminderHours} onChange={(e) => setReminderHours(e.target.value)} placeholder="24, 2" />
        </Field>
        <Field label="Анонс за, днів" hint="0 — не анонсувати самому">
          <Input
            inputMode="numeric"
            value={announceDays}
            onChange={(e) => setAnnounceDays(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
      </div>
      <Button variant="primary" block onClick={save} loading={saving}>
        Зберегти
      </Button>
    </div>
  );
}
