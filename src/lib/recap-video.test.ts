import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { squadConfig } from "../config/squad.ts";
import { type HistoryEvent, computeRecap, makePeriod } from "./recap.ts";
import {
  type MonthlyVideoReport,
  type WeeklyVideoReport,
  VIDEO,
  VIDEO_DURATION_MS,
  VIDEO_FRAMES,
  VIDEO_SCENES,
  buildVideoReport,
  resultLine,
  sceneAt,
  sceneStart,
  targetLine,
} from "./recap-video.ts";

const TZ = "Asia/Singapore";
const targets = [
  { month: "2026-10-01", targetCases: 20 },
  { month: "2026-11-01", targetCases: 30 },
  { month: "2026-12-01", targetCases: 40 },
];
const sg = (local: string) => new Date(`${local}+08:00`);
const ev = (local: string, delta: number, member = "a"): HistoryEvent => ({
  changedAt: sg(local).toISOString(),
  month: `${local.slice(0, 7)}-01`,
  delta,
  squadMemberId: member,
});
const totals = (events: HistoryEvent[]) => {
  const out: Record<string, number> = {};
  for (const e of events) out[e.month] = (out[e.month] ?? 0) + e.delta;
  return out;
};
function report(events: HistoryEvent[], month = "2026-10-01", now = sg("2026-11-02T10:00:00"), t = targets) {
  const recap = computeRecap({
    period: makePeriod("month", month, TZ, now),
    events,
    targets: t,
    storedTotals: totals(events),
    memberIds: ["a", "b", "c"],
    now,
  });
  const r = buildVideoReport(recap, "CJO Squad Mission Q4 2026");
  if (r) assert.equal(r.kind, "month");
  return r as MonthlyVideoReport | null;
}
function weekly(events: HistoryEvent[], monday: string, now: Date, members = ["a", "b", "c"]) {
  const recap = computeRecap({
    period: makePeriod("week", monday, TZ, now),
    events,
    targets,
    storedTotals: totals(events),
    memberIds: members,
    now,
  });
  const r = buildVideoReport(recap, "CJO Squad Mission Q4 2026");
  if (r) assert.equal(r.kind, "week");
  return r as WeeklyVideoReport | null;
}

describe("timeline", () => {
  test("about 20 s at 30 fps, 9:16 at 1080 × 1920", () => {
    assert.deepEqual(VIDEO, { width: 1080, height: 1920, fps: 30 });
    assert.equal(VIDEO_DURATION_MS, 20600);
    assert.equal(VIDEO_FRAMES, 618);
    assert.ok(VIDEO_DURATION_MS >= 15000 && VIDEO_DURATION_MS <= 25000);
    assert.deepEqual(VIDEO_SCENES.map((s) => s.id), ["opening", "achievement", "milestones", "momentum", "closing"]);
  });
  test("sceneAt walks the scenes and clamps at both ends", () => {
    assert.deepEqual(sceneAt(0), { index: 0, id: "opening", local: 0, duration: 2800 });
    assert.equal(sceneAt(2799).id, "opening");
    assert.deepEqual(sceneAt(2800), { index: 1, id: "achievement", local: 0, duration: 5000 });
    assert.equal(sceneAt(-5).id, "opening");
    assert.equal(sceneAt(999999).id, "closing");
    assert.equal(sceneStart(4), 2800 + 5000 + 4600 + 4200);
  });
});

describe("buildVideoReport", () => {
  test("a month above target: total, percent and cases above target", () => {
    const events = [ev("2026-10-03T10:00:00", 12, "a"), ev("2026-10-20T10:00:00", 16, "b")];
    const r = report(events);
    assert.ok(r);
    assert.equal(r.monthLabel, "October");
    assert.equal(r.year, "2026");
    assert.equal(r.status, "completed");
    assert.equal(r.total, 28);
    assert.equal(r.added, 28);
    assert.equal(r.target, 20);
    assert.equal(r.percent, 140);
    assert.equal(r.meterPercent, 100);
    assert.equal(r.complete, true);
    assert.equal(r.exceededBy, 8);
    assert.equal(r.remaining, 0);
    assert.equal(targetLine(r), "8 cases above target");
    assert.equal(resultLine(r), "October 2026 · 28 of 20 cases · 140%");
    assert.equal(r.fileBase, `${squadConfig.fileSlug}-October-2026`);
    assert.equal(r.campaign?.total, 28);
    assert.equal(r.campaign?.target, 90);
  });

  test("a month still running and below target: never negative above-target", () => {
    const now = sg("2026-10-24T21:00:00");
    const r = report([ev("2026-10-05T10:00:00", 14)], "2026-10-01", now);
    assert.ok(r);
    assert.equal(r.status, "in-progress");
    assert.equal(r.percent, 70);
    assert.equal(r.exceededBy, 0);
    assert.equal(r.remaining, 6);
    assert.equal(targetLine(r), "6 cases to go");
  });

  test("exactly on target, and one case short", () => {
    assert.equal(targetLine(report([ev("2026-10-05T10:00:00", 20)])!), "Target hit!");
    assert.equal(targetLine(report([ev("2026-10-05T10:00:00", 19)])!), "1 case to go");
  });

  test("a later month's history doesn't leak into the selected month", () => {
    const events = [ev("2026-10-05T10:00:00", 20), ev("2026-11-03T10:00:00", 7)];
    const oct = report(events, "2026-10-01", sg("2026-11-05T10:00:00"))!;
    const nov = report(events, "2026-11-01", sg("2026-11-05T10:00:00"))!;
    assert.equal(oct.total, 20);
    assert.equal(nov.total, 7);
    assert.equal(nov.target, 30);
    assert.equal(nov.campaign?.total, 27);
  });

  test("no target for the month: counts only, no percentage, no division", () => {
    const events = [ev("2026-10-05T10:00:00", 5)];
    const r = report(events, "2026-10-01", sg("2026-11-02T10:00:00"), [{ month: "2026-11-01", targetCases: 30 }]);
    assert.ok(r);
    assert.equal(r.target, null);
    assert.equal(r.percent, null);
    assert.equal(r.meterPercent, 0);
    assert.equal(r.complete, false);
    assert.equal(r.exceededBy, 0);
    assert.equal(targetLine(r), null);
    assert.equal(resultLine(r), "October 2026 · 5 cases");
  });

  test("milestones: only the selected month's, in the order reached", () => {
    const events = [
      ev("2026-10-02T10:00:00", 1),
      ev("2026-10-09T10:00:00", 9),
      ev("2026-10-12T10:00:00", -2),
      ev("2026-10-15T10:00:00", 2), // back to 10: halfway not repeated
      ev("2026-10-30T10:00:00", 10),
      ev("2026-11-02T10:00:00", 1),
    ];
    const r = report(events, "2026-10-01", sg("2026-11-03T10:00:00"))!;
    assert.deepEqual(r.milestones.map((m) => m.key), ["started", "halfway", "momentum", "cleared"]);
    assert.deepEqual(r.milestones.map((m) => m.label), ["Mission started", "Halfway there", "Momentum", "October cleared"]);
    const nov = report(events, "2026-11-01", sg("2026-11-03T10:00:00"))!;
    assert.deepEqual(nov.milestones.map((m) => m.key), ["started"]);
  });

  test("an unavailable recap gives no report", () => {
    const events = [ev("2026-10-05T10:00:00", 5)];
    const now = sg("2026-10-24T21:00:00");
    for (const kind of ["month", "week"] as const) {
      const broken = computeRecap({
        period: makePeriod(kind, kind === "month" ? "2026-10-01" : "2026-10-19", TZ, now),
        events,
        targets,
        storedTotals: { "2026-10-01": 9 },
        memberIds: ["a"],
        now,
      });
      assert.equal(buildVideoReport(broken, "Q4"), null);
    }
  });

  test("an empty month reads as zero", () => {
    const r = report([], "2026-10-01", sg("2026-10-02T10:00:00"))!;
    assert.equal(r.total, 0);
    assert.equal(r.percent, 0);
    assert.equal(r.remaining, 20);
    assert.deepEqual(r.milestones, []);
  });
});

describe("buildVideoReport (weekly)", () => {
  const NOW = sg("2026-10-24T21:00:00"); // Saturday
  test("the week's net, days, month rows as of the week's end, share of target", () => {
    const events = [
      ev("2026-10-12T10:00:00", 19, "a"), // last week
      ev("2026-10-18T23:59:59.999", 1, "a"), // Sunday: still last week
      ev("2026-10-19T00:00:00", 2, "b"), // Monday 00:00: this week
      ev("2026-10-20T11:00:00", 5, "c"),
      ev("2026-10-20T12:00:00", -1, "c"), // correction
      ev("2026-10-22T09:00:00", 3, "a"),
    ];
    const r = weekly(events, "2026-10-19", NOW)!;
    assert.equal(r.title, "This week");
    assert.equal(r.periodLabel, "Mon 19 Oct – Sun 25 Oct 2026");
    assert.equal(r.status, "in-progress");
    assert.equal(r.added, 9, "net this week, never the month total (29)");
    assert.equal(r.activeDays, 3);
    assert.deepEqual(
      r.days.map((d) => [d.label, d.net, d.future]),
      [["Mon", 2, false], ["Tue", 4, false], ["Wed", 0, false], ["Thu", 3, false], ["Fri", 0, false], ["Sat", 0, false], ["Sun", 0, true]],
    );
    assert.deepEqual(r.months, [
      { label: "October", total: 29, target: 20, percent: 145, meterPercent: 100, complete: true, added: 9 },
    ]);
    assert.deepEqual(r.shareOfTarget, { percent: 45, monthLabel: "October" });
    assert.equal(r.campaign?.total, 29);
    assert.equal(r.fileBase, `${squadConfig.fileSlug}-Week-of-19-Oct-2026`);
    assert.equal(resultLine(r), "Week of 19 Oct 2026 · +9 cases together");
    // Last week holds the Sunday 23:59:59.999 case and its own end-of-week progress.
    const last = weekly(events, "2026-10-12", NOW)!;
    assert.equal(last.title, "Last week");
    assert.equal(last.status, "completed");
    assert.equal(last.added, 20);
    assert.equal(last.months[0].total, 20);
    assert.deepEqual(last.milestones.map((m) => m.key), ["started", "halfway", "momentum", "cleared"]);
    assert.deepEqual(r.milestones, [], "nothing new this week");
  });

  test("a week across two months shows both months, no single share", () => {
    const events = [ev("2026-10-27T10:00:00", 2), ev("2026-11-01T10:00:00", 3)];
    const r = weekly(events, "2026-10-26", sg("2026-11-03T10:00:00"))!;
    assert.equal(r.added, 5);
    assert.deepEqual(r.months.map((m) => [m.label, m.added, m.total, m.target]), [["October", 2, 2, 20], ["November", 3, 3, 30]]);
    assert.equal(r.shareOfTarget, null);
    assert.deepEqual(r.milestones.map((m) => [m.key, m.monthLabel]), [["started", "October"], ["started", "November"]]);
    assert.equal(r.fileBase, `${squadConfig.fileSlug}-Week-of-26-Oct-2026`);
  });

  test("a quiet week and a corrections-only week read honestly", () => {
    const quiet = weekly([ev("2026-10-05T10:00:00", 4)], "2026-10-19", NOW)!;
    assert.equal(quiet.added, 0);
    assert.equal(quiet.activeDays, 0);
    assert.equal(quiet.shareOfTarget, null);
    assert.equal(quiet.months[0].total, 4);
    assert.equal(resultLine(quiet), "Week of 19 Oct 2026 · 0 cases together");
    const fixes = weekly([ev("2026-10-05T10:00:00", 4), ev("2026-10-20T10:00:00", -1)], "2026-10-19", NOW)!;
    assert.equal(fixes.added, -1);
    assert.equal(resultLine(fixes), "Week of 19 Oct 2026 · −1 case together");
  });

  test("the first campaign week starts before the campaign: only campaign months are shown", () => {
    const r = weekly([ev("2026-10-02T10:00:00", 1)], "2026-09-28", sg("2026-10-03T10:00:00"))!;
    assert.equal(r.periodLabel, "Mon 28 Sep – Sun 4 Oct 2026");
    assert.deepEqual(r.months.map((m) => m.label), ["October"]);
    assert.equal(r.fileBase, `${squadConfig.fileSlug}-Week-of-28-Sep-2026`);
  });
});
