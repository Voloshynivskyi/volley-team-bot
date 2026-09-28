import { desc, eq } from "drizzle-orm";
import { InputFile } from "grammy";
import { db, getSettings, schema } from "@/db";
import { isoWeekKey } from "@/lib/cron-rules";
import { env } from "@/lib/env";
import { dict } from "@/lib/i18n";
import { api } from "@/lib/telegram/api";
import { teamLang } from "@/lib/telegram/messages";
import { formatInTimeZone } from "date-fns-tz";

/** Повний знімок бази в JSON — достатньо, щоб відновити все руками або скриптом. */
export async function exportAll() {
  const [players, competitions, events, attendance, posts, settings, leagueMatches, mvpVotes, auditLog] =
    await Promise.all([
      db.select().from(schema.players),
      db.select().from(schema.competitions),
      db.select().from(schema.events),
      db.select().from(schema.attendance),
      db.select().from(schema.posts),
      db.select().from(schema.settings),
      db.select().from(schema.leagueMatches),
      db.select().from(schema.mvpVotes),
      db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.createdAt)).limit(2000),
    ]);
  return {
    exportedAt: new Date().toISOString(),
    players,
    competitions,
    events,
    attendance,
    posts,
    settings,
    leagueMatches,
    mvpVotes,
    auditLog,
  };
}

/** Раз на тиждень надсилає власнику файл з усією базою. */
export async function sendWeeklyBackup(now = new Date()): Promise<"sent" | "skip"> {
  const owner = env.OWNER_TELEGRAM_ID;
  if (!owner) return "skip";
  const s = await getSettings();
  const week = isoWeekKey(now, s.timezone);
  if (s.lastBackupWeek === week) return "skip";

  const data = await exportAll();
  const day = formatInTimeZone(now, s.timezone, "yyyy-MM-dd");
  const file = new InputFile(Buffer.from(JSON.stringify(data, null, 1)), `backup-${day}.json`);
  await api.sendDocument(owner, file, { caption: dict(teamLang(s)).botExtra.backupCaption(day) });
  await db.update(schema.settings).set({ lastBackupWeek: week }).where(eq(schema.settings.id, 1));
  return "sent";
}
