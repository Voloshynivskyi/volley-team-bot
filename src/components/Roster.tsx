"use client";

import { useState } from "react";
import { usePlayers, type PlayerDTO } from "@/lib/client/api";
import { PLAYER_STATUS_VALUES, positionLabel } from "@/lib/positions";
import { useApp } from "./context";
import { PageHeader } from "./i18n";
import PlayerForm from "./PlayerForm";
import { Button, Empty, Fab, Row, Section, Spinner } from "./ui";

export default function Roster() {
  const { me, t, canEditPlayers } = useApp();
  const { data, isLoading } = usePlayers();
  const [editing, setEditing] = useState<PlayerDTO | null | "new">(null);

  const total = data?.length ?? 0;
  // Підказка для учасника, який ще не знайшов себе в складі.
  const showSelfHint = canEditPlayers && !me.player && total > 0;

  return (
    <>
      <PageHeader title={t.roster.title} subtitle={total > 0 ? t.roster.count(total) : undefined} />

      {showSelfHint && (
        <p className="mx-4 mb-4 rounded-2xl bg-court-tint px-4 py-3 text-[14px] leading-snug">{t.roster.selfHint}</p>
      )}

      {isLoading && (
        <div className="flex justify-center py-10 text-hint">
          <Spinner />
        </div>
      )}

      {!isLoading && total === 0 && (
        <Section>
          <Empty
            title={t.roster.emptyTitle}
            text={canEditPlayers ? t.roster.emptyCanEdit : t.roster.emptyViewer}
            action={
              canEditPlayers && (
                <Button variant="primary" onClick={() => setEditing("new")}>
                  {t.roster.addPlayer}
                </Button>
              )
            }
          />
        </Section>
      )}

      <div className="space-y-5">
        {PLAYER_STATUS_VALUES.map((status) => {
          const list = (data ?? []).filter((p) => p.status === status);
          if (!list.length) return null;
          return (
            <Section key={status} title={t.playerStatus[status]}>
              {list.map((p) => (
                <Row key={p.id} onClick={canEditPlayers ? () => setEditing(p) : undefined}>
                  <div className="numeral w-11 shrink-0 text-center text-[30px]">
                    {p.number != null ? p.number : <span className="text-hint">–</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-medium">
                      {p.fullName}
                      {me.player?.id === p.id && (
                        <span className="ml-2 text-[12px] font-normal text-court">{t.common.you}</span>
                      )}
                    </p>
                    <p className="truncate text-[13px] text-hint">
                      {[
                        positionLabel(t, p.position),
                        p.heightCm ? t.cm(p.heightCm) : null,
                        p.telegramUsername ? `@${p.telegramUsername}` : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </div>
                  {status === "injured" && <span aria-hidden>🩹</span>}
                </Row>
              ))}
            </Section>
          );
        })}
      </div>

      {canEditPlayers && <Fab label={t.roster.fab} onClick={() => setEditing("new")} />}
      <PlayerForm open={editing !== null} onClose={() => setEditing(null)} player={editing === "new" ? null : editing} />
    </>
  );
}
