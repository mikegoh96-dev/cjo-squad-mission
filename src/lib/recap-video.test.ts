import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type HistoryEvent, computeRecap, makePeriod } from "./recap.ts";
import {
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
  return buildVideoReport(recap, "CJO Squad Mission Q4 2026");
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
    assert.equal(r.fileBase, "CJO-Squad-Recap-October-2026");
    assert.equal(r.contributors, 2);
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

  test("an unavailable or weekly recap gives no report", () => {
    const events = [ev("2026-10-05T10:00:00", 5)];
    const now = sg("2026-10-24T21:00:00");
    const broken = computeRecap({
      period: makePeriod("month", "2026-10-01", TZ, now),
      events,
      targets,
      storedTotals: { "2026-10-01": 9 },
      memberIds: ["a"],
      now,
    });
    assert.equal(buildVideoReport(broken, "Q4"), null);
    const weekly = computeRecap({
      period: makePeriod("week", "2026-10-19", TZ, now),
      events,
      targets,
      storedTotals: totals(events),
      memberIds: ["a"],
      now,
    });
    assert.equal(buildVideoReport(weekly, "Q4"), null);
  });

  test("an empty month reads as zero", () => {
    const r = report([], "2026-10-01", sg("2026-10-02T10:00:00"))!;
    assert.equal(r.total, 0);
    assert.equal(r.percent, 0);
    assert.equal(r.remaining, 20);
    assert.deepEqual(r.milestones, []);
  });
});
