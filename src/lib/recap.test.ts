import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  type HistoryEvent,
  type Recap,
  HISTORY_PAGE_LIMIT,
  addDays,
  computeRecap,
  makePeriod,
  mondayOf,
  recapHeadline,
  recapPeriods,
  recapSummaryText,
  zonedMidnight,
} from "./recap.ts";

const TZ = "Asia/Singapore";
const campaign = { startsOn: "2026-10-01", endsOn: "2026-12-31", timeZone: TZ };
const targets = [
  { month: "2026-10-01", targetCases: 20 },
  { month: "2026-11-01", targetCases: 30 },
  { month: "2026-12-01", targetCases: 40 },
];
const months = targets.map((t) => t.month);
const A = "member-a";
const B = "member-b";
const C = "member-c";
const memberIds = [A, B, C];
/** A Singapore wall-clock time as an instant. */
const sg = (local: string) => new Date(`${local}+08:00`);
const ev = (local: string, delta: number, member = A, month = `${local.slice(0, 7)}-01`): HistoryEvent => ({
  changedAt: sg(local).toISOString(),
  month,
  delta,
  squadMemberId: member,
});
/** Stored totals that match the events (complete history). */
const totalsOf = (events: HistoryEvent[]) => {
  const out: Record<string, number> = {};
  for (const e of events) out[e.month] = (out[e.month] ?? 0) + e.delta;
  return out;
};
const NOW = sg("2026-10-24T21:00:00"); // Saturday
const week = (monday: string, now = NOW) => makePeriod("week", monday, TZ, now);
const month = (m: string, now = NOW) => makePeriod("month", m, TZ, now);
function ready(r: Recap) {
  assert.equal(r.state, "ready", `expected a ready recap, got ${r.state}`);
  return r as Extract<Recap, { state: "ready" }>;
}
const recap = (period: ReturnType<typeof week>, events: HistoryEvent[], storedTotals = totalsOf(events)) =>
  computeRecap({ period, events, targets, storedTotals, memberIds, now: NOW });

describe("calendar", () => {
  test("Singapore midnight is 16:00 UTC the day before", () => {
    assert.equal(zonedMidnight("2026-10-26", TZ).toISOString(), "2026-10-25T16:00:00.000Z");
    assert.equal(zonedMidnight("2026-10-01", TZ).toISOString(), "2026-09-30T16:00:00.000Z");
  });
  test("zones with daylight saving land on local midnight", () => {
    assert.equal(zonedMidnight("2026-11-01", "America/New_York").toISOString(), "2026-11-01T04:00:00.000Z");
    assert.equal(zonedMidnight("2026-11-02", "America/New_York").toISOString(), "2026-11-02T05:00:00.000Z");
  });
  test("weeks start on Monday", () => {
    assert.equal(mondayOf("2026-10-25"), "2026-10-19"); // Sunday
    assert.equal(mondayOf("2026-10-26"), "2026-10-26"); // Monday
    assert.equal(mondayOf("2026-11-01"), "2026-10-26"); // Sunday, new month
    assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  });
});

describe("periods", () => {
  test("a week runs Monday 00:00 to next Monday 00:00 (exclusive) in Singapore time", () => {
    const p = week("2026-10-19");
    assert.equal(p.start, "2026-10-18T16:00:00.000Z");
    assert.equal(p.end, "2026-10-25T16:00:00.000Z");
    assert.equal(p.endDate, "2026-10-26");
    assert.equal(p.title, "This week");
    assert.equal(p.status, "in-progress");
    assert.equal(p.rangeLabel, "Mon 19 Oct – Sun 25 Oct 2026");
    assert.equal(p.boundsLabel, "Mon 19 Oct, 00:00 to Mon 26 Oct, 00:00 (Singapore time)");
    assert.equal(week("2026-10-12").title, "Last week");
    assert.equal(week("2026-10-05").title, "Week of 5 Oct");
    assert.equal(week("2026-09-28").rangeLabel, "Mon 28 Sep – Sun 4 Oct 2026", "fixed names, same in every engine");
  });
  test("a week is completed exactly at next Monday 00:00", () => {
    assert.equal(week("2026-10-19", sg("2026-10-25T23:59:59.999")).status, "in-progress");
    assert.equal(week("2026-10-19", sg("2026-10-26T00:00:00")).status, "completed");
  });
  test("a month runs from the 1st to the next 1st", () => {
    const p = month("2026-10-01");
    assert.equal(p.start, "2026-09-30T16:00:00.000Z");
    assert.equal(p.end, "2026-10-31T16:00:00.000Z");
    assert.equal(p.title, "October");
    assert.equal(p.rangeLabel, "1 – 31 Oct 2026");
    assert.equal(month("2026-11-01").rangeLabel, "1 – 30 Nov 2026");
    assert.equal(month("2026-10-01", sg("2026-11-01T00:00:00")).status, "completed");
  });
  test("weekly choices: this week and last week, only where they overlap the campaign", () => {
    assert.deepEqual(
      recapPeriods({ kind: "week", campaign, months, now: NOW }).map((p) => p.key),
      ["week:2026-10-19", "week:2026-10-12"],
    );
    // 2 Oct: the week of 28 Sep holds the campaign start; the week before doesn't.
    assert.deepEqual(
      recapPeriods({ kind: "week", campaign, months, now: sg("2026-10-02T09:00:00") }).map((p) => p.key),
      ["week:2026-09-28"],
    );
    assert.deepEqual(recapPeriods({ kind: "week", campaign, months, now: sg("2026-09-20T09:00:00") }), []);
    // After the campaign: its final two weeks.
    assert.deepEqual(
      recapPeriods({ kind: "week", campaign, months, now: sg("2027-01-10T09:00:00") }).map((p) => p.key),
      ["week:2026-12-28", "week:2026-12-21"],
    );
  });
  test("monthly choices: every campaign month that has started, newest first", () => {
    assert.deepEqual(
      recapPeriods({ kind: "month", campaign, months, now: NOW }).map((p) => p.key),
      ["month:2026-10-01"],
    );
    const nov = recapPeriods({ kind: "month", campaign, months, now: sg("2026-11-05T09:00:00") });
    assert.deepEqual(nov.map((p) => [p.key, p.status]), [
      ["month:2026-11-01", "in-progress"],
      ["month:2026-10-01", "completed"],
    ]);
  });
});

describe("computeRecap", () => {
  test("Sunday 23:59 belongs to the week; Monday 00:00 starts the next one", () => {
    const events = [ev("2026-10-18T23:59:59.999", 1), ev("2026-10-19T00:00:00", 2), ev("2026-10-25T23:59:59.999", 4)];
    const next = sg("2026-10-27T09:00:00");
    const r = (monday: string) =>
      ready(computeRecap({ period: week(monday, next), events, targets, storedTotals: totalsOf(events), memberIds, now: next }));
    assert.equal(r("2026-10-12").casesAdded, 1);
    assert.equal(r("2026-10-19").casesAdded, 6);
    assert.equal(r("2026-10-26").casesAdded, 0);
  });

  test("31 Oct 23:59 counts for October; 1 Nov 00:00 for November", () => {
    const events = [ev("2026-10-31T23:59:00", 3), ev("2026-11-01T00:00:00", 2)];
    const now = sg("2026-11-03T09:00:00");
    const r = (m: string) =>
      ready(computeRecap({ period: month(m, now), events, targets, storedTotals: totalsOf(events), memberIds, now }));
    assert.equal(r("2026-10-01").casesAdded, 3);
    assert.equal(r("2026-11-01").casesAdded, 2);
    assert.deepEqual(r("2026-11-01").months.map((m) => m.label), ["November"]);
  });

  test("an empty period is ready with zeros (never the current total)", () => {
    const events = [ev("2026-10-05T10:00:00", 9)];
    const r = ready(recap(week("2026-10-19"), events));
    assert.equal(r.casesAdded, 0);
    assert.equal(r.updates, 0);
    assert.equal(r.activeDays, 0);
    assert.deepEqual(r.milestones, []);
    assert.equal(r.months[0].progress.total, 9, "progress still shows where the month stands");
    assert.equal(r.months[0].added, 0);
    assert.equal(r.months[0].shareOfTarget, null);
    assert.equal(recapHeadline(r), "Our story is just getting started");
    const done = ready(recap(week("2026-10-12"), events));
    assert.equal(recapHeadline(done), "A quiet stretch for the squad");
  });

  test("many increments and a correction add up to the net", () => {
    const events = [
      ev("2026-10-19T09:00:00", 1, A),
      ev("2026-10-19T09:00:01", 1, A),
      ev("2026-10-19T09:00:02", 1, A),
      ev("2026-10-20T12:00:00", 2, B),
      ev("2026-10-20T12:05:00", -2, B), // B's slip, corrected
      ev("2026-10-22T08:00:00", 1, C),
    ];
    const r = ready(recap(week("2026-10-19"), events));
    assert.equal(r.casesAdded, 4);
    assert.equal(r.updates, 6);
    assert.equal(r.activeDays, 2, "Mon and Thu; Tue netted to zero");
    assert.deepEqual(
      r.days.map((d) => [d.date.slice(8), d.net, d.future]),
      [["19", 3, false], ["20", 0, false], ["21", 0, false], ["22", 1, false], ["23", 0, false], ["24", 0, false], ["25", 0, true]],
    );
    assert.equal(recapHeadline(r), "4 cases added together");
  });

  test("progress is the month's total at the end of the period, not today's", () => {
    const events = [ev("2026-10-05T10:00:00", 7), ev("2026-10-13T10:00:00", 3), ev("2026-10-20T10:00:00", 5)];
    const r = ready(recap(week("2026-10-12"), events));
    assert.equal(r.casesAdded, 3);
    assert.equal(r.months[0].progress.total, 10);
    assert.equal(r.months[0].progress.remaining, 10);
    assert.equal(r.months[0].progress.percent, 50);
    assert.equal(r.months[0].shareOfTarget, 15);
    assert.equal(r.campaign?.total, 10);
    assert.equal(r.campaign?.target, 90);
  });

  test("target achieved and exceeded", () => {
    const events = [ev("2026-10-05T10:00:00", 12), ev("2026-10-14T10:00:00", 10)];
    const r = ready(recap(month("2026-10-01"), events));
    const oct = r.months[0];
    assert.equal(oct.added, 22);
    assert.equal(oct.progress.complete, true);
    assert.equal(oct.progress.exceededBy, 2);
    assert.equal(oct.progress.percent, 110);
    assert.equal(oct.progress.meterPercent, 100);
    assert.equal(oct.shareOfTarget, 110);
  });

  test("a week across two months reports each month separately", () => {
    const events = [ev("2026-10-27T10:00:00", 2), ev("2026-11-01T10:00:00", 3)];
    const now = sg("2026-11-03T09:00:00");
    const r = ready(
      computeRecap({ period: week("2026-10-26", now), events, targets, storedTotals: totalsOf(events), memberIds, now }),
    );
    assert.equal(r.casesAdded, 5);
    assert.deepEqual(r.months.map((m) => [m.label, m.added, m.progress.total]), [["October", 2, 2], ["November", 3, 3]]);
  });

  test("days outside the campaign have no month (no target): the period still reads", () => {
    const events = [ev("2026-10-02T10:00:00", 1)];
    const now = sg("2026-10-03T10:00:00");
    const r = ready(
      computeRecap({ period: week("2026-09-28", now), events, targets, storedTotals: totalsOf(events), memberIds, now }),
    );
    assert.deepEqual(r.months.map((m) => m.month), ["2026-10-01"]);
    assert.equal(r.casesAdded, 1);
  });

  test("history that doesn't add up to the stored total makes the period unavailable", () => {
    const events = [ev("2026-10-20T10:00:00", 2)];
    const r = recap(week("2026-10-19"), events, { "2026-10-01": 5 });
    assert.deepEqual(r.state === "unavailable" && r.reason, "history-incomplete");
  });

  test("an incomplete month the period doesn't touch only hides the campaign total", () => {
    const events = [ev("2026-10-20T10:00:00", 2)];
    const r = ready(recap(week("2026-10-19"), events, { "2026-10-01": 2, "2026-11-01": 4 }));
    assert.equal(r.casesAdded, 2);
    assert.equal(r.campaign, null);
  });

  test("a full history page is reported, never silently cut", () => {
    const events = Array.from({ length: HISTORY_PAGE_LIMIT }, () => ev("2026-10-20T10:00:00", 0));
    const r = recap(week("2026-10-19"), events, {});
    assert.deepEqual(r.state === "unavailable" && r.reason, "too-much-history");
  });

  test("a removed member's leftover rows are ignored", () => {
    const events = [ev("2026-10-20T10:00:00", 2, A), ev("2026-10-20T11:00:00", 5, "gone")];
    const r = ready(recap(week("2026-10-19"), events, { "2026-10-01": 2 }));
    assert.equal(r.casesAdded, 2);
  });

  test("milestones: first reach only, inside the period, every one a jump crosses", () => {
    const events = [
      ev("2026-10-14T10:00:00", 1), // started (last week)
      ev("2026-10-15T10:00:00", 9), // halfway = 10 (last week)
      ev("2026-10-16T10:00:00", -2), // correction: back to 8
      ev("2026-10-20T10:00:00", 2), // 10 again: not a new halfway
      ev("2026-10-21T10:00:00", 10), // 20: momentum (15) and cleared (20) together
    ];
    const r = ready(recap(week("2026-10-19"), events));
    assert.deepEqual(r.milestones.map((m) => [m.key, m.label, m.cases]), [
      ["momentum", "Momentum", 15],
      ["cleared", "October cleared", 20],
    ]);
    assert.equal(r.milestones[0].reachedAt, sg("2026-10-21T10:00:00").toISOString());
    const last = ready(recap(week("2026-10-12"), events));
    assert.deepEqual(last.milestones.map((m) => m.key), ["started", "halfway"]);
    const all = ready(recap(month("2026-10-01"), events));
    assert.deepEqual(all.milestones.map((m) => m.key), ["started", "halfway", "momentum", "cleared"]);
  });

  test("the summary text is collective: totals only, no names", () => {
    const events = [ev("2026-10-20T10:00:00", 3, A), ev("2026-10-21T10:00:00", 8, B)];
    const r = ready(recap(week("2026-10-19"), events));
    const text = recapSummaryText(r, { monthLabel: "October", total: 11, target: 20, remaining: 9 });
    assert.equal(
      text,
      [
        "CJO Squad Recap · This week (Mon 19 Oct – Sun 25 Oct 2026, in progress)",
        "+11 cases together",
        "October: 11 of 20 cases (55%)",
        "Milestones: Mission started, Halfway there",
        "Campaign: 11 of 90 cases",
        "Next: 9 cases to clear October",
        "One Squad. One Mission. Let's keep the momentum going.",
      ].join("\n"),
    );
    assert.doesNotMatch(text, /member-/);
  });
});
