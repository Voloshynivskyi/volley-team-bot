/**
 * Сухий прогін крона на реальній базі: що бот зробив би зараз, нічого не надсилаючи.
 * npm run cron:dry
 */
import { config } from "dotenv";
config({ path: ".env.local" });

(async () => {
  const { db, getSettings, schema } = await import("../src/db");
  const rules = await import("../src/lib/cron-rules");
  const { loadEventBundle } = await import("../src/lib/events");
  const { lineupFor } = await import("../src/lib/telegram/messages");
  const { standingsViews } = await import("../src/lib/standings-service");
  const { eq } = await import("drizzle-orm");

  const now = new Date();
  const s = await getSettings();
  const hours = rules.parseReminderHours(s.reminderHours);
  console.log("now", now.toISOString(), "| tz", s.timezone, "| week", rules.isoWeekKey(now, s.timezone));
  console.log("backup would send:", s.lastBackupWeek !== rules.isoWeekKey(now, s.timezone));
  console.log("digest time now:", rules.digestTime(now, s.timezone), "| last digest week:", s.lastDigestWeek);

  const posts = await db.query.posts.findMany();
  const has = (eventId: number, kind: string, off = 0) =>
    posts.some((p) => p.eventId === eventId && p.kind === kind && p.offsetHours === off);

  const evs = await db.query.events.findMany({ where: eq(schema.events.status, "scheduled") });
  for (const e of evs.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    const left = (e.startsAt.getTime() - now.getTime()) / 3_600_000;
    const actions: string[] = [];
    if (left > 0) {
      if (s.announceDaysBefore > 0 && left <= s.announceDaysBefore * 24 && !has(e.id, "announce")) actions.push("ANNOUNCE");
      for (const h of rules.dueReminders(left, hours)) if (!has(e.id, "reminder", h)) actions.push(`REMIND ${h}h`);
      if (e.type === "game" && rules.shortageDue(left) && !has(e.id, "shortage")) {
        const b = await loadEventBundle(e.id);
        if (b && !lineupFor(b).ok) actions.push("SHORTAGE");
      }
    } else if (e.type === "game" && rules.resultPromptDue(e.startsAt, now) && !has(e.id, "result")) {
      actions.push("RESULT PROMPT");
    }
    const b = await loadEventBundle(e.id);
    const lu = b && e.type === "game" ? lineupFor(b) : null;
    console.log(
      `${e.startsAt.toISOString().slice(0, 16)} ${String(e.opponent).padEnd(28)} left=${left.toFixed(1)}h`,
      lu ? `lineup ${lu.going}/${lu.minPlayers} gaps=[${lu.gaps.map((g) => g.position).join(",")}]` : "",
      actions.length ? `→ ${actions.join(", ")}` : "",
    );
  }

  for (const v of await standingsViews()) {
    console.log(`\n== ${v.competition.shortName ?? v.competition.name} (${v.mode}) ==`, v.error ?? "");
    v.rows.forEach((r, i) => console.log(`${i + 1}. ${r.team.padEnd(28)} ${r.played} ${r.won}-${r.lost} ${r.setsFor}:${r.setsAgainst} ${r.points}${r.isUs ? "  <= us" : ""}`));
    if (v.status) console.log("status:", JSON.stringify(v.status));
  }
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
