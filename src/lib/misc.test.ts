import { describe, expect, it } from "vitest";
import { dueReminders, isoWeekKey, parseReminderHours, resultPromptDue, shortageDue, weekRange } from "./cron-rules";
import { buildIcs, foldLine, icsEscape } from "./ics";
import { dict, fmtRound, langFromCode } from "./i18n";
import { parseOmwTable } from "./omw";

describe("cron rules", () => {
  it("parses reminder hours", () => {
    expect(parseReminderHours("24, 2, x, 24, 0")).toEqual([24, 2]);
  });
  it("sends each reminder only inside its one-hour window", () => {
    expect(dueReminders(23.5, [24, 2])).toEqual([24]);
    expect(dueReminders(22.9, [24, 2])).toEqual([]);
    expect(dueReminders(1.5, [24, 2])).toEqual([2]);
    expect(dueReminders(0.4, [1])).toEqual([1]);
  });
  it("shortage alert between 48 and 24 hours", () => {
    expect(shortageDue(47)).toBe(true);
    expect(shortageDue(49)).toBe(false);
    expect(shortageDue(24)).toBe(false);
  });
  it("asks for the score 2h after start, not for old games", () => {
    const start = new Date("2026-09-27T07:45:00Z");
    expect(resultPromptDue(start, new Date("2026-09-27T09:44:00Z"))).toBe(false);
    expect(resultPromptDue(start, new Date("2026-09-27T09:46:00Z"))).toBe(true);
    expect(resultPromptDue(start, new Date("2026-10-05T09:46:00Z"))).toBe(false);
  });
  it("computes the local week (Warsaw, across DST end)", () => {
    const now = new Date("2026-10-26T10:00:00Z"); // понеділок після переходу на зимовий час
    expect(isoWeekKey(now, "Europe/Warsaw")).toBe("2026-W44");
    const { from, to } = weekRange(now, "Europe/Warsaw");
    expect(from.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(to.getTime() - from.getTime()).toBe(7 * 86_400_000);
  });
});

describe("ics", () => {
  it("escapes special characters", () => {
    expect(icsEscape("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });
  it("folds long lines at 75 bytes without splitting UTF-8", () => {
    const line = "SUMMARY:" + "ї".repeat(60);
    const folded = foldLine(line).split("\r\n");
    expect(folded.length).toBeGreaterThan(1);
    for (const part of folded) expect(Buffer.byteLength(part, "utf8")).toBeLessThanOrEqual(75);
    expect(folded.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
  });
  it("builds a valid calendar", () => {
    const ics = buildIcs("Redmoon", [
      {
        uid: "event-1@x",
        start: new Date("2026-10-18T10:15:00Z"),
        end: new Date("2026-10-18T12:15:00Z"),
        summary: "🏐 Redmoon — GLADIATORZY",
        location: "Hala ZS8, ul. Reja 3",
        updated: new Date("2026-10-01T00:00:00Z"),
      },
    ]);
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("DTSTART:20261018T101500Z");
    expect(ics).toContain("LOCATION:Hala ZS8\\, ul. Reja 3");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });
});

describe("i18n", () => {
  it("maps Telegram language codes", () => {
    expect(langFromCode("uk")).toBe("uk");
    expect(langFromCode("ru-RU")).toBe("ru");
    expect(langFromCode("be")).toBe("ru");
    expect(langFromCode("en-GB")).toBe("en");
    expect(langFromCode("pl", "uk")).toBe("uk");
  });
  it("formats rounds and plurals per language", () => {
    expect(fmtRound(dict("uk"), "3")).toBe("3 тур");
    expect(fmtRound(dict("en"), "3")).toBe("Round 3");
    expect(fmtRound(dict("en"), "Półfinał")).toBe("Półfinał");
    expect(dict("uk").roster.count(21)).toBe("21 гравець");
    expect(dict("ru").roster.count(3)).toBe("3 игрока");
    expect(dict("en").ordinalPlace(2)).toBe("2nd place");
    expect(dict("en").ordinalPlace(12)).toBe("12th place");
  });
});

describe("OMW table parser", () => {
  it("reads the tblview table", () => {
    const html = `<table class="tblview"><tr><th>№</th><th></th><th>Team</th><th>Rozegrane</th><th>Wygrane</th><th>Przegrane</th><th>Sety</th><th>Punkty</th></tr>
      <tr><td>1</td><td><img/></td><td><a>Huragany Wrocław</a></td><td>5</td><td>5</td><td>0</td><td>13 - 2</td><td>13</td></tr>
      <tr><td>4</td><td></td><td>RED Moon</td><td>5</td><td>2</td><td>3</td><td>7 - 8</td><td>7</td></tr></table>`;
    const rows = parseOmwTable(html);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ team: "RED Moon", played: 5, won: 2, lost: 3, setsFor: 7, setsAgainst: 8, points: 7 });
  });
});
