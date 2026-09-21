"use client";

import { useState } from "react";
import { usePlayers, type PlayerDTO } from "@/lib/client/api";
import { PLAYER_STATUS, positionLabel } from "@/lib/positions";
import { countOf } from "@/lib/text";
import { useApp } from "./context";
import PlayerForm from "./PlayerForm";
import { Button, Empty, Fab, Row, Section, Spinner } from "./ui";

export default function Roster() {
  const { me, isAdmin } = useApp();
  const { data, isLoading } = usePlayers();
  const [editing, setEditing] = useState<PlayerDTO | null | "new">(null);

  const total = data?.length ?? 0;

  return (
    <>
      <header className="px-5 pb-3 pt-5">
        <h1 className="text-[24px] font-semibold leading-tight">Склад</h1>
        {total > 0 && <p className="text-[15px] text-hint">{countOf(total, ["гравець", "гравці", "гравців"])}</p>}
      </header>

      {isLoading && (
        <div className="flex justify-center py-10 text-hint">
          <Spinner />
        </div>
      )}

      {!isLoading && total === 0 && (
        <Section>
          <Empty
            title="Склад порожній"
            text={isAdmin ? "Додайте гравців: ім'я, номер і позицію." : "Адміністратори ще не додали гравців."}
            action={isAdmin && <Button variant="primary" onClick={() => setEditing("new")}>Додати гравця</Button>}
          />
        </Section>
      )}

      <div className="space-y-5">
        {PLAYER_STATUS.map((s) => {
          const list = (data ?? []).filter((p) => p.status === s.value);
          if (!list.length) return null;
          return (
            <Section key={s.value} title={s.label}>
              {list.map((p) => (
                <Row key={p.id} onClick={isAdmin ? () => setEditing(p) : undefined}>
                  <div className="numeral w-11 shrink-0 text-center text-[30px]">
                    {p.number != null ? p.number : <span className="text-hint">–</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-medium">
                      {p.fullName}
                      {me.player?.id === p.id && <span className="ml-2 text-[12px] font-normal text-court">ви</span>}
                    </p>
                    <p className="truncate text-[13px] text-hint">
                      {[positionLabel(p.position), p.heightCm ? `${p.heightCm} см` : null, p.telegramUsername ? `@${p.telegramUsername}` : null]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </div>
                  {s.value === "injured" && <span aria-hidden>🩹</span>}
                </Row>
              ))}
            </Section>
          );
        })}
      </div>

      {isAdmin && <Fab label="Гравець" onClick={() => setEditing("new")} />}
      <PlayerForm open={editing !== null} onClose={() => setEditing(null)} player={editing === "new" ? null : editing} />
    </>
  );
}
