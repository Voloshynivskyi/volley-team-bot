"use client";

import { useMemo } from "react";
import { usePlayers, type EventDTO } from "@/lib/client/api";
import { checkLineup, type LineupCheck } from "@/lib/lineup";
import { useApp } from "./context";

/** Перевірка складу на гру за правилами команди; null — поки не завантажився склад або це не гра. */
export function useLineup(event: EventDTO | null | undefined): LineupCheck | null {
  const { me } = useApp();
  const { data: players } = usePlayers();
  return useMemo(() => {
    if (!event || event.type !== "game" || !players) return null;
    return checkLineup(me.settings.lineupRules, event.attendance, players);
  }, [event, players, me.settings.lineupRules]);
}

/** Коротко для списків і героя: "⚠️ Бракує: ліберо" або "✓ Склад зібрано". */
export function LineupSummary({ check }: { check: LineupCheck }) {
  const { t } = useApp();
  if (check.ok) return <span className="text-going">✓ {t.lineup.ok}</span>;
  const parts = [
    check.missingPlayers ? t.lineup.missing(check.missingPlayers) : null,
    ...check.gaps.map((g) => `${t.positions[g.position].label.toLowerCase()}${g.need > 1 ? ` ×${g.need}` : ""}`),
  ].filter(Boolean);
  return (
    <span className="text-not">
      ⚠️ {t.lineup.gaps}: {parts.join(", ")}
    </span>
  );
}

export function LineupCard({ check }: { check: LineupCheck }) {
  const { t } = useApp();
  return (
    <div className="rounded-2xl bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[14px] font-medium text-hint">{t.lineup.title}</p>
        <p className={`text-[14px] font-medium ${check.ok ? "text-going" : "text-not"}`}>
          {check.ok ? t.lineup.ok : t.lineup.short}
        </p>
      </div>
      <p className={`numeral mt-1 text-[40px] ${check.going >= check.minPlayers ? "" : "text-not"}`}>
        {t.lineup.goingOf(check.going, check.minPlayers)}
      </p>

      <ul className="mt-3 grid grid-cols-2 gap-2">
        {check.positions.map((p) => {
          const gap = check.gaps.find((g) => g.position === p.position);
          const range = p.min === p.max ? `${p.min}` : `${p.min}–${p.max}`;
          return (
            <li
              key={p.position}
              className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-[14px] ${
                gap ? "bg-not-tint" : "bg-going-tint"
              }`}
            >
              <span className="min-w-0 truncate">{t.positions[p.position].label}</span>
              <span className="shrink-0 font-medium">
                <span className="numeral text-[18px]">{p.count}</span>
                <span className="text-hint"> / {range}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {check.universalsUsed > 0 && (
        <p className="mt-2 text-[13px] text-hint">{t.lineup.universalsCover(check.universalsUsed)}</p>
      )}
      {check.tooMany && <p className="mt-2 text-[13px] text-maybe">{t.lineup.tooMany(check.maxPlayers)}</p>}
    </div>
  );
}
