import assert from "node:assert/strict";
import { test } from "node:test";
import {
  crossedMilestone,
  daysInMonth,
  formatDelta,
  heroMessage,
  missionProgress,
  missionStatus,
  momentumHeadline,
  monthMilestones,
  nextMilestone,
  pluralCases,
  relativeTime,
  remainingMessage,
  unlockMessage,
} from "./mission.ts";

const cases: Array<[number, number, number, number, number, boolean, number]> = [
  // total, target, percent, meter, remaining, complete, exceededBy
  [0, 20, 0, 0, 20, false, 0],
  [1, 20, 5, 5, 19, false, 0],
  [10, 20, 50, 50, 10, false, 0],
  [19, 20, 95, 95, 1, false, 0],
  [20, 20, 100, 100, 0, true, 0],
  [21, 20, 105, 100, 0, true, 1],
  [30, 30, 100, 100, 0, true, 0],
  [40, 40, 100, 100, 0, true, 0],
  [17, 20, 85, 85, 3, false, 0],
];

for (const [total, target, percent, meter, remaining, complete, exceeded] of cases) {
  test(`${total} / ${target}`, () => {
    const p = missionProgress(total, target);
    assert.equal(p.percent, percent);
    assert.equal(p.meterPercent, meter);
    assert.equal(p.remaining, remaining);
    assert.equal(p.complete, complete);
    assert.equal(p.exceededBy, exceeded);
  });
}

test("percent rounds down: never shows 100% before the target is hit", () => {
  assert.equal(missionProgress(199, 200).percent, 99);
  assert.equal(missionProgress(29, 30).percent, 96);
  assert.equal(missionProgress(1, 3).percent, 33);
});

test("invalid values are rejected", () => {
  for (const [total, target] of [
    [-1, 20], [1.5, 20], [Number.NaN, 20], [Number.POSITIVE_INFINITY, 20],
    [5, 0], [5, -20], [5, 2.5], [5, Number.NaN],
  ]) {
    assert.throws(() => missionProgress(total, target), RangeError, `${total}/${target}`);
  }
  // @ts-expect-error runtime guard against undefined
  assert.throws(() => missionProgress(undefined, 20), RangeError);
});

test("mission status", () => {
  const status = (total: number, target: number, phase: "past" | "current" | "upcoming", day = 15, days = 30) =>
    missionStatus({ progress: missionProgress(total, target), phase, dayOfMonth: day, daysInMonth: days });
  assert.equal(status(0, 30, "upcoming"), "upcoming");
  assert.equal(status(0, 20, "current"), "not-started");
  assert.equal(status(5, 20, "current", 15, 30), "behind-pace"); // pace 10 by mid-month
  assert.equal(status(10, 20, "current", 15, 30), "on-track");
  assert.equal(status(2, 20, "current", 2, 31), "on-track"); // early month, ahead of pace
  assert.equal(status(16, 20, "current"), "almost-there");
  assert.equal(status(20, 20, "current"), "complete");
  assert.equal(status(21, 20, "past"), "complete");
  assert.equal(status(18, 20, "past"), "closed");
});

test("messages", () => {
  assert.equal(remainingMessage(missionProgress(17, 20), "October"), "3 more cases to hit October");
  assert.equal(remainingMessage(missionProgress(19, 20), "October"), "1 more case to hit October");
  assert.equal(remainingMessage(missionProgress(20, 20), "October"), "October target hit");
  assert.equal(remainingMessage(missionProgress(22, 20), "October"), "2 cases above target");
  assert.equal(pluralCases(1), "1 case");
  assert.equal(pluralCases(0), "0 cases");
});

test("calendar helpers", () => {
  assert.equal(daysInMonth("2026-10-01"), 31);
  assert.equal(daysInMonth("2026-11-01"), 30);
  assert.equal(daysInMonth("2028-02-01"), 29);
  const now = new Date("2026-10-02T10:00:00Z");
  assert.equal(relativeTime(new Date("2026-10-02T09:59:30Z"), now), "just now");
  assert.equal(relativeTime(new Date("2026-10-02T09:55:00Z"), now), "5 min ago");
  assert.equal(relativeTime(new Date("2026-10-02T07:00:00Z"), now), "3 h ago");
  assert.equal(relativeTime(new Date("2026-09-30T10:00:00Z"), now), "2 days ago");
});

test("monthly milestones: first case, 50%, 75%, target", () => {
  const ms = (total: number, target: number) =>
    monthMilestones(missionProgress(total, target), "October").map((m) => [m.label, m.cases, m.reached]);
  assert.deepEqual(ms(0, 20), [
    ["Mission started", 1, false], ["Halfway there", 10, false], ["Momentum", 15, false], ["October cleared", 20, false],
  ]);
  assert.deepEqual(ms(15, 20).map((m) => m[2]), [true, true, true, false]);
  assert.deepEqual(ms(30, 30).map((m) => m[1]), [1, 15, 23, 30]); // 75% of 30 rounds up
  assert.deepEqual(ms(40, 40).map((m) => m[2]), [true, true, true, true]);
  // Tiny targets: coinciding steps keep the bigger name, no duplicates.
  assert.deepEqual(ms(0, 1), [["October cleared", 1, false]]);
  assert.deepEqual(ms(0, 2).map((m) => m[0]), ["Halfway there", "October cleared"]);
  assert.equal(nextMilestone(monthMilestones(missionProgress(12, 20), "October"))?.label, "Momentum");
  assert.equal(nextMilestone(monthMilestones(missionProgress(21, 20), "October")), null);
});

test("crossing a milestone triggers one celebration (the highest)", () => {
  assert.equal(crossedMilestone(0, 1, 20, "October")?.key, "started");
  assert.equal(crossedMilestone(9, 10, 20, "October")?.key, "halfway");
  assert.equal(crossedMilestone(8, 20, 20, "October")?.key, "cleared"); // skips past halfway + momentum
  assert.equal(crossedMilestone(10, 12, 20, "October"), null); // between milestones
  assert.equal(crossedMilestone(20, 25, 20, "October"), null); // already cleared
  assert.equal(crossedMilestone(12, 9, 20, "October"), null); // corrections never celebrate
  assert.equal(crossedMilestone(5, 5, 20, "October"), null);
  assert.throws(() => crossedMilestone(-1, 5, 20, "October"), RangeError);
});

test("momentum formatting", () => {
  assert.equal(formatDelta(6), "+6");
  assert.equal(formatDelta(0), "0");
  assert.equal(formatDelta(-2), "−2");
  assert.throws(() => formatDelta(Number.NaN), RangeError);
  assert.equal(momentumHeadline(6, 18), "6 cases added today");
  assert.equal(momentumHeadline(1, 1), "1 case added today");
  assert.equal(momentumHeadline(0, 18), "18 cases added this week");
  assert.equal(momentumHeadline(0, 0), "Every case counts. Add the first one today.");
  assert.equal(momentumHeadline(-2, -2), "Every case counts. Add the first one today.");
});

test("large values stay exact", () => {
  const p = missionProgress(1000, 20);
  assert.equal(p.percent, 5000);
  assert.equal(p.meterPercent, 100);
  assert.equal(p.exceededBy, 980);
  assert.equal(p.remaining, 0);
});

test("hero message is collective", () => {
  assert.equal(heroMessage(missionProgress(17, 20), "current", "October"), "We're 3 cases away");
  assert.equal(heroMessage(missionProgress(19, 20), "current", "October"), "We're 1 case away");
  assert.equal(heroMessage(missionProgress(20, 20), "current", "October"), "October cleared. We did it together!");
  assert.equal(heroMessage(missionProgress(22, 20), "current", "October"), "October cleared · 2 cases above target");
  assert.equal(heroMessage(missionProgress(0, 30), "upcoming", "November"), "Starts 1 November · 30 cases to go");
  assert.equal(heroMessage(missionProgress(35, 40), "past", "December"), "December closed 5 short");
});

test("unlock message points at the next milestone", () => {
  const p = missionProgress(13, 20);
  assert.equal(unlockMessage(p, nextMilestone(monthMilestones(p, "October"))), "2 more cases to unlock Momentum");
  const q = missionProgress(14, 20);
  assert.equal(unlockMessage(q, nextMilestone(monthMilestones(q, "October"))), "1 more case to unlock Momentum");
  const done = missionProgress(20, 20);
  assert.equal(unlockMessage(done, nextMilestone(monthMilestones(done, "October"))), "Every milestone unlocked");
});
