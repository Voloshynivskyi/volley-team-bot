"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import type { CompetitionType } from "@/db/schema";
import { api, useCompetitions, useSettings, type CompetitionDTO, type SettingsDTO } from "@/lib/client/api";
import { confirmDialog, haptic } from "@/lib/client/tg";
import { isLang, LANGS, type Lang } from "@/lib/i18n";
import { COMPETITION_TYPE_VALUES, options } from "@/lib/positions";
import { useApp } from "./context";
import { PageHeader } from "./i18n";
import { Button, errorText, Field, Input, Row, Section, Segmented, Sheet, Spinner, Toggle, useToast } from "./ui";

export default function Manage() {
  const { me, t } = useApp();
  return (
    <>
      <PageHeader title={t.manage.title} subtitle={t.manage.subtitle} />
      <div className="space-y-6">
        <GroupSection />
        <CompetitionsSection />
        <SettingsSection />
        <Section title={t.manage.botCommands}>
          <div className="space-y-2 px-4 py-3 text-[15px]">
            <p>
              <code className="text-court">/next</code> — {t.manage.cmdNext}
            </p>
            <p>
              <code className="text-court">/schedule</code> — {t.manage.cmdSchedule}
            </p>
            <p>
              <code className="text-court">/roster</code> — {t.manage.cmdRoster}
            </p>
            <p>
              <code className="text-court">/here</code> — {t.manage.cmdHere}
            </p>
            {me.settings.chatBound && (
              <p className="pt-1 text-hint">
                {t.manage.scheduleInfo(me.settings.announceDaysBefore, me.settings.reminderHours.split(",").map((h) => h.trim()).join(", "))}
              </p>
            )}
          </div>
        </Section>
      </div>
    </>
  );
}

function GroupSection() {
  const { me, t } = useApp();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const s = me.settings;

  async function unbind() {
    if (!(await confirmDialog(t.manage.unbindConfirm))) return;
    setBusy(true);
    try {
      await api("/api/settings", { method: "DELETE" });
      await mutate("/api/me");
      toast(t.manage.unbound);
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={t.manage.group}>
      <div className="px-4 py-3">
        {s.chatBound ? (
          <>
            <p className="text-[16px] font-medium">{s.chatTitle ?? t.manage.groupBound}</p>
            <p className="text-[14px] text-hint">{s.threadId ? t.manage.writesThread : t.manage.writesGroup}</p>
            <Button variant="ghost" className="mt-2 -ml-4" onClick={unbind} loading={busy}>
              {t.manage.unbind}
            </Button>
          </>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-[15px]">
            <li>{t.manage.step1}</li>
            <li>{t.manage.step2}</li>
            <li>
              {t.manage.step3} <code className="text-court">/here</code>.
            </li>
          </ol>
        )}
      </div>
    </Section>
  );
}

function CompetitionsSection() {
  const { t } = useApp();
  const { data, isLoading } = useCompetitions(true);
  const [editing, setEditing] = useState<CompetitionDTO | null | "new">(null);
  const active = (data ?? []).filter((c) => !c.isArchived);
  const archived = (data ?? []).filter((c) => c.isArchived);

  return (
    <>
      <Section
        title={t.manage.competitions}
        action={
          <button type="button" onClick={() => setEditing("new")} className="text-[15px] font-medium text-court">
            {t.manage.addShort}
          </button>
        }
      >
        {isLoading && (
          <div className="flex justify-center py-6 text-hint">
            <Spinner small />
          </div>
        )}
        {!isLoading && !data?.length && (
          <p className="px-4 py-4 text-[15px] text-hint">{t.manage.competitionsEmpty}</p>
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
  const { t } = useApp();
  const type = t.competitionTypes[c.type];
  return (
    <Row onClick={onClick} className={muted ? "opacity-50" : ""}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-medium">{c.name}</p>
        <p className="text-[13px] text-hint">{[type, c.season, muted ? t.manage.archivedLower : null].filter(Boolean).join(", ")}</p>
      </div>
      <span className="text-hint" aria-hidden>
        ›
      </span>
    </Row>
  );
}

function CompetitionForm({ onClose, competition }: { onClose: () => void; competition: CompetitionDTO | null }) {
  const { t } = useApp();
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
      toast(t.manage.errName, "error");
      return;
    }
    setSaving(true);
    try {
      const body = { name, type, season, standingsUrl: url, isArchived: archived };
      if (competition) await api(`/api/competitions/${competition.id}`, { method: "PATCH", body });
      else await api("/api/competitions", { method: "POST", body });
      await refresh();
      haptic("success");
      toast(competition ? t.common.saved : t.manage.compAdded);
      onClose();
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!competition) return;
    if (!(await confirmDialog(t.manage.compDeleteConfirm(competition.name)))) return;
    setSaving(true);
    try {
      await api(`/api/competitions/${competition.id}`, { method: "DELETE" });
      await refresh();
      toast(t.manage.compDeleted);
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
      title={competition ? t.manage.compTitleEdit : t.manage.compTitleNew}
      footer={
        <div className="flex gap-2">
          {competition && (
            <Button variant="danger" size="lg" onClick={remove} disabled={saving}>
              {t.common.delete}
            </Button>
          )}
          <Button variant="primary" size="lg" block onClick={submit} loading={saving}>
            {competition ? t.common.save : t.common.add}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <Field label={t.manage.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.manage.namePh} autoFocus={!competition} />
        </Field>
        <Field label={t.manage.type}>
          <Segmented value={type} onChange={setType} options={options(COMPETITION_TYPE_VALUES, t.competitionTypes)} />
        </Field>
        <Field label={t.manage.season}>
          <Input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2026/27" className="w-32" />
        </Field>
        <Field label={t.manage.standingsUrl}>
          <Input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
        {competition && (
          <Toggle checked={archived} onChange={setArchived} label={t.manage.archived} hint={t.manage.archivedHint} />
        )}
      </div>
    </Sheet>
  );
}

function SettingsSection() {
  const { t } = useApp();
  const { data } = useSettings(true);
  return (
    <Section title={t.manage.settings}>
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
  const { t } = useApp();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [teamName, setTeamName] = useState(initial.teamName);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [reminderHours, setReminderHours] = useState(initial.reminderHours);
  const [announceDays, setAnnounceDays] = useState(String(initial.announceDaysBefore));
  const [language, setLanguage] = useState<Lang>(isLang(initial.language) ? initial.language : "uk");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: { teamName, timezone, reminderHours, announceDaysBefore: Number(announceDays) || 0, language },
      });
      await Promise.all([mutate("/api/settings"), mutate("/api/me")]);
      haptic("success");
      toast(t.manage.settingsSaved);
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <Field label={t.manage.teamName}>
        <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} />
      </Field>
      <Field label={t.manage.timezone} hint={t.manage.timezoneHint}>
        <Input list="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} autoComplete="off" />
        <datalist id="tz">
          {COMMON_TZ.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.manage.remindHours} hint={t.manage.remindHoursHint}>
          <Input value={reminderHours} onChange={(e) => setReminderHours(e.target.value)} placeholder="24, 2" />
        </Field>
        <Field label={t.manage.announceDays} hint={t.manage.announceDaysHint}>
          <Input
            inputMode="numeric"
            value={announceDays}
            onChange={(e) => setAnnounceDays(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
      </div>
      <Field label={t.manage.botLanguage} hint={t.manage.botLanguageHint}>
        <Segmented value={language} onChange={setLanguage} options={LANGS} />
      </Field>
      <Button variant="primary" block onClick={save} loading={saving}>
        {t.common.save}
      </Button>
    </div>
  );
}
