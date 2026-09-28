"use client";

import { useMemo, useState } from "react";
import { useSWRConfig } from "swr";
import { api, isEventsKey, STANDINGS_KEY, useStandings, type LeagueMatchDTO, type StandingsDTO } from "@/lib/client/api";
import { haptic, openLink } from "@/lib/client/tg";
import { fmtDayShort } from "@/lib/time";
import { useApp } from "./context";
import { PageHeader } from "./i18n";
import { Button, Empty, errorText, Section, Segmented, Sheet, Spinner, useToast } from "./ui";

type League = StandingsDTO["leagues"][number];

export default function Standings() {
  const { t, isAdmin } = useApp();
  const { data, isLoading, error } = useStandings();
  const leagues = data?.leagues ?? [];
  const [selected, setSelected] = useState<number | null>(null);
  const league = leagues.find((l) => l.competition.id === selected) ?? leagues[0];

  return (
    <>
      <PageHeader title={t.table.title} />

      {isLoading && (
        <div className="flex justify-center py-10 text-hint">
          <Spinner />
        </div>
      )}
      {error && <p className="px-5 py-6 text-center text-hint">{error.message}</p>}

      {!isLoading && !leagues.length && (
        <Section>
          <Empty title={t.table.none} text={isAdmin ? t.table.noneAdmin : undefined} />
        </Section>
      )}

      {leagues.length > 1 && (
        <div className="px-4 pb-3">
          <Segmented
            value={String(league?.competition.id ?? "")}
            onChange={(v) => setSelected(Number(v))}
            options={leagues.map((l) => ({
              value: String(l.competition.id),
              label: l.competition.shortName ?? l.competition.name,
            }))}
          />
        </div>
      )}

      {league && (
        <div className="space-y-5">
          <StatusCard league={league} />
          <TableView league={league} />
          {league.mode === "computed" && <Matches league={league} />}
        </div>
      )}

      {data && <MvpBoard rows={data.mvp} />}
    </>
  );
}

function StatusCard({ league: l }: { league: League }) {
  const { t } = useApp();
  if (l.error) return <p className="px-5 text-[15px] text-not">{t.table.externalFailed}</p>;
  if (!l.us) return null;
  if (l.rows.every((r) => r.played === 0)) {
    return (
      <section className="px-4">
        <div className="rounded-2xl bg-surface px-5 py-4">
          <p className="text-[14px] font-medium text-hint">{l.competition.name}</p>
          <p className="mt-1 text-[15px]">{t.table.noResults}</p>
        </div>
      </section>
    );
  }
  const s = l.status;
  const stateText = !s
    ? null
    : s.state === "clinched"
      ? t.table.clinched
      : s.state === "eliminated"
        ? t.table.eliminated
        : s.state === "in"
          ? t.table.inZone(s.gap, s.spots)
          : t.table.outZone(s.gap, s.spots);
  const tone = !s ? "" : s.state === "clinched" || s.state === "in" ? "text-going" : "text-not";
  const position = l.rows.findIndex((r) => r.isUs) + 1;

  return (
    <section className="px-4">
      <div className="rounded-2xl bg-surface px-5 py-4">
        <p className="text-[14px] font-medium text-hint">{l.competition.name}</p>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <p className="font-cond text-[34px] font-bold leading-none">{t.ordinalPlace(position)}</p>
          <p className="shrink-0 text-[15px]">
            <span className="numeral text-[30px]">{l.us.points}</span> {t.pointsWord(l.us.points)}
          </p>
        </div>
        {stateText && <p className={`mt-2 text-[15px] font-medium ${tone}`}>{stateText}</p>}
        {s?.semifinalOpponent && s.state !== "eliminated" && (
          <p className="mt-0.5 text-[14px] text-hint">{t.table.semifinal(s.semifinalOpponent)}</p>
        )}
        <p className="mt-2 text-[14px] text-hint">
          {t.table.record(l.us.won, l.us.lost, l.us.setsFor, l.us.setsAgainst)}
          {l.mode === "computed" && l.us.remaining > 0 ? ` · ${t.table.remaining(l.us.remaining)}` : ""}
        </p>
        {l.mode === "external" && <p className="mt-2 text-[13px] text-hint">{t.table.externalNoPlayoff}</p>}
      </div>
    </section>
  );
}

function TableView({ league: l }: { league: League }) {
  const { t } = useApp();
  if (!l.rows.length) return null;
  return (
    <Section
      action={
        l.mode === "external" && l.competition.standingsUrl ? (
          <button
            type="button"
            onClick={() => openLink(l.competition.standingsUrl!)}
            className="text-[13px] font-medium text-court"
          >
            {t.table.external}
          </button>
        ) : undefined
      }
    >
      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-[12px] text-hint">
            <th className="w-8 py-2 pl-3 text-left font-medium">#</th>
            <th className="py-2 text-left font-medium">{t.table.colTeam}</th>
            <th className="w-7 py-2 text-center font-medium">{t.table.colPlayed}</th>
            <th className="w-12 py-2 text-center font-medium">{t.table.colWL}</th>
            <th className="w-12 py-2 text-center font-medium">{t.table.colSets}</th>
            <th className="w-10 py-2 pr-3 text-right font-medium">{t.table.colPts}</th>
          </tr>
        </thead>
        <tbody>
          {l.rows.map((r, i) => {
            const zoneEdge = l.spots != null && i === l.spots - 1 && i < l.rows.length - 1;
            return (
              <tr
                key={r.team}
                className={`${r.isUs ? "bg-court-tint font-semibold" : ""} ${
                  zoneEdge ? "border-b-2 border-dashed border-going" : "border-b border-sep last:border-b-0"
                }`}
              >
                <td className="py-2.5 pl-3 text-hint">{i + 1}</td>
                <td className="max-w-0 truncate py-2.5 pr-2">{r.team}</td>
                <td className="py-2.5 text-center">{r.played}</td>
                <td className="py-2.5 text-center">
                  {r.won}–{r.lost}
                </td>
                <td className="py-2.5 text-center text-hint">
                  {r.setsFor}:{r.setsAgainst}
                </td>
                <td className="numeral py-2.5 pr-3 text-right text-[17px]">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {l.spots != null && (
        <p className="border-t border-sep px-3 py-2 text-[12px] text-going">{t.table.zone(l.spots)}</p>
      )}
    </Section>
  );
}

function Matches({ league: l }: { league: League }) {
  const { t, tz, lang, isAdmin } = useApp();
  const [editing, setEditing] = useState<LeagueMatchDTO | null>(null);
  const rounds = useMemo(() => {
    const map = new Map<number, LeagueMatchDTO[]>();
    for (const m of l.matches) map.set(m.round ?? 0, [...(map.get(m.round ?? 0) ?? []), m]);
    return [...map.entries()];
  }, [l.matches]);

  return (
    <div className="space-y-4">
      <p className="px-5 text-[15px] font-medium text-hint">{t.table.matches}</p>
      {isAdmin && <p className="-mt-2 px-5 text-[13px] text-hint">{t.table.adminHint}</p>}
      {rounds.map(([round, list]) => {
        const first = list[0]?.startsAt ? new Date(list[0].startsAt) : null;
        const title = [t.roundN(String(round)), first ? fmtDayShort(first, tz, lang) : null].filter(Boolean).join(" · ");
        return (
          <Section key={round} title={title}>
            {list.map((m) => (
              <MatchRow key={m.id} match={m} onClick={isAdmin ? () => setEditing(m) : undefined} />
            ))}
          </Section>
        );
      })}
      {editing && <ResultSheet match={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MatchRow({ match: m, onClick }: { match: LeagueMatchDTO; onClick?: () => void }) {
  const { t } = useApp();
  const played = m.walkover != null || (m.setsHome != null && m.setsAway != null);
  const homeWon = m.walkover ? m.walkover === "away" : played && m.setsHome! > m.setsAway!;
  const line = (team: string, sets: number | null, won: boolean, forfeit: boolean) => (
    <div className="flex items-center justify-between gap-3">
      <span className={`min-w-0 truncate ${played && won ? "font-semibold" : ""}`}>{team}</span>
      <span className={`numeral shrink-0 text-[18px] ${played && won ? "" : "text-hint"}`}>
        {forfeit ? "WO" : played ? sets : ""}
      </span>
    </div>
  );
  const inner = (
    <>
      <div className="min-w-0 flex-1 space-y-0.5 text-[15px]">
        {line(m.home, m.setsHome, homeWon, m.walkover === "home")}
        {line(m.away, m.setsAway, played && !homeWon, m.walkover === "away")}
      </div>
      {(m.postponed || !played) && (
        <span className={`shrink-0 text-[12px] ${m.postponed ? "text-maybe" : "text-hint"}`}>
          {m.postponed ? t.table.postponed : "—"}
        </span>
      )}
    </>
  );
  const cls = `flex w-full items-center gap-3 px-4 py-2.5 text-left border-b border-sep last:border-b-0 ${
    m.isOurs ? "bg-court-tint/60" : ""
  }`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} active:bg-court-tint`}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function ResultSheet({ match: m, onClose }: { match: LeagueMatchDTO; onClose: () => void }) {
  const { t } = useApp();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function save(body: { setsHome: number | null; setsAway: number | null; walkover: "home" | "away" | null }) {
    setBusy(true);
    try {
      await api(`/api/league-matches/${m.id}`, { method: "PATCH", body });
      await Promise.all([mutate(STANDINGS_KEY), mutate(isEventsKey)]);
      haptic("success");
      toast(t.table.resultSaved);
      onClose();
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={t.table.enterResult}>
      <div className="space-y-3 pb-2">
        <p className="text-center text-[16px] font-medium">
          {m.home} — {m.away}
        </p>
        <div className="grid grid-cols-4 gap-2">
          {[
            [3, 0],
            [2, 1],
            [1, 2],
            [0, 3],
          ].map(([h, a]) => (
            <Button
              key={`${h}${a}`}
              size="lg"
              disabled={busy}
              onClick={() => save({ setsHome: h, setsAway: a, walkover: null })}
              className={`numeral text-[22px] ${m.setsHome === h && m.setsAway === a ? "!bg-court !text-white" : ""}`}
            >
              {h}:{a}
            </Button>
          ))}
        </div>
        {!m.isOurs && (
          <div className="grid gap-2">
            <Button disabled={busy} onClick={() => save({ setsHome: null, setsAway: null, walkover: "home" })}>
              {t.table.forfeit(m.home)}
            </Button>
            <Button disabled={busy} onClick={() => save({ setsHome: null, setsAway: null, walkover: "away" })}>
              {t.table.forfeit(m.away)}
            </Button>
          </div>
        )}
        {m.isOurs && <p className="text-[13px] text-hint">{t.table.ourMatch}</p>}
        <Button variant="ghost" block disabled={busy} onClick={() => save({ setsHome: null, setsAway: null, walkover: null })}>
          {t.table.clear}
        </Button>
      </div>
    </Sheet>
  );
}

function MvpBoard({ rows }: { rows: StandingsDTO["mvp"] }) {
  const { t } = useApp();
  return (
    <Section title={t.mvp.title} className="mt-5">
      {rows.length ? (
        rows.map((r, i) => (
          <div key={r.playerId} className="flex items-center gap-3 border-b border-sep px-4 py-2.5 last:border-b-0">
            <span className="w-6 text-center" aria-hidden>
              {i === 0 ? "🏅" : ""}
            </span>
            <span className="numeral w-8 text-center text-[20px]">{r.number ?? "–"}</span>
            <span className="min-w-0 flex-1 truncate text-[15px]">{r.fullName}</span>
            <span className="numeral text-[18px]">×{r.wins}</span>
          </div>
        ))
      ) : (
        <p className="px-4 py-3 text-[15px] text-hint">{t.mvp.empty}</p>
      )}
    </Section>
  );
}
