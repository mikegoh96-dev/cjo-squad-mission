import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Campaign,
  computeSquadProgress,
  pickCurrentCampaign,
  stageFor,
  todayIn,
} from "./progress.ts";

const campaign: Campaign = {
  id: "c1",
  name: "Q4",
  startsOn: "2030-10-01",
  endsOn: "2030-12-31",
  timeZone: "Asia/Singapore",
};
const targets = [
  { month: "2030-11-01", targetCases: 30 },
  { month: "2030-10-01", targetCases: 20 },
  { month: "2030-12-01", targetCases: 40 },
];
const members = [
  { squadMemberId: "s", displayName: "Sarah" },
  { squadMemberId: "m", displayName: "Mike" },
  { squadMemberId: "j", displayName: "Jeremy" },
];
const counts = [
  { squadMemberId: "m", month: "2030-10-01", caseCount: 6 },
  { squadMemberId: "j", month: "2030-10-01", caseCount: 4 },
  { squadMemberId: "s", month: "2030-10-01", caseCount: 3 },
  { squadMemberId: "m", month: "2030-11-01", caseCount: 2 },
  { squadMemberId: "x", month: "2030-11-01", caseCount: 50 }, // not in this squad
];
const midNovember = new Date("2030-11-15T04:00:00Z");

test("squad totals are derived from member counts", () => {
  const p = computeSquadProgress({ campaign, targets, members, counts, now: midNovember });
  assert.equal(p.totalCases, 15); // 6 + 4 + 3 + 2; outsider ignored
  assert.equal(p.overallTarget, 90);
  assert.equal(p.remaining, 75);
  assert.equal(p.percent, 16.7);
});

test("monthly progress, status and remaining", () => {
  const p = computeSquadProgress({ campaign, targets, members, counts, now: midNovember });
  assert.deepEqual(
    p.months.map((m) => [m.label, m.total, m.target, m.remaining, m.status]),
    [
      ["October", 13, 20, 7, "past"],
      ["November", 2, 30, 28, "current"],
      ["December", 0, 40, 40, "upcoming"],
    ],
  );
  assert.equal(p.currentMonth?.label, "November");
});

test("contributions are alphabetical (never ranked by count)", () => {
  const p = computeSquadProgress({ campaign, targets, members, counts, now: midNovember });
  assert.deepEqual(p.contributions.map((c) => c.displayName), ["Jeremy", "Mike", "Sarah"]);
  assert.equal(p.contributions.find((c) => c.displayName === "Mike")?.total, 8);
});

test("milestones are fractions of the overall target", () => {
  const p = computeSquadProgress({ campaign, targets, members, counts, now: midNovember });
  assert.deepEqual(p.milestones.map((m) => [m.percent, m.cases, m.reached]), [
    [25, 23, false], [50, 45, false], [75, 68, false], [100, 90, false],
  ]);
});

test("progress stages", () => {
  assert.equal(stageFor(0), "launch");
  assert.equal(stageFor(10), "building");
  assert.equal(stageFor(25), "halfway");
  assert.equal(stageFor(60), "closing-in");
  assert.equal(stageFor(80), "final-push");
  assert.equal(stageFor(100), "accomplished");
  assert.equal(stageFor(120), "accomplished");
});

test("current campaign selection uses the campaign time zone", () => {
  const next: Campaign = { ...campaign, id: "c2", startsOn: "2031-01-01", endsOn: "2031-03-31" };
  // 2030-12-31T17:00Z is already 1 Jan 2031 in Singapore.
  const newYearSg = new Date("2030-12-31T17:00:00Z");
  assert.equal(todayIn("Asia/Singapore", newYearSg), "2031-01-01");
  assert.equal(pickCurrentCampaign([campaign, next], newYearSg)?.id, "c2");
  assert.equal(pickCurrentCampaign([campaign, next], midNovember)?.id, "c1");
  assert.equal(pickCurrentCampaign([campaign], new Date("2029-01-01T00:00:00Z"))?.id, "c1", "upcoming");
  assert.equal(pickCurrentCampaign([], midNovember), null);
});
