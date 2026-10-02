import assert from "node:assert/strict";
import { test } from "node:test";
import { type Campaign, computeSquadProgress, pickCurrentCampaign, todayIn } from "./progress.ts";

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
  { squadMemberId: "m", month: "2030-10-01", caseCount: 12 },
  { squadMemberId: "j", month: "2030-10-01", caseCount: 6 },
  { squadMemberId: "s", month: "2030-10-01", caseCount: 3 },
  { squadMemberId: "m", month: "2030-11-01", caseCount: 2 },
  { squadMemberId: "x", month: "2030-11-01", caseCount: 50 }, // not in this squad
];
const at = (iso: string) => computeSquadProgress({ campaign, targets, members, counts, now: new Date(iso) });

test("squad totals are derived from member counts", () => {
  const p = at("2030-11-15T04:00:00Z");
  assert.equal(p.overall.total, 23); // 12 + 6 + 3 + 2; outsider ignored
  assert.equal(p.overall.target, 90);
  assert.equal(p.overall.remaining, 67);
  assert.equal(p.overall.percent, 25);
});

test("month journey: phases, statuses and the featured month", () => {
  const p = at("2030-11-15T04:00:00Z");
  assert.equal(p.phase, "active");
  assert.deepEqual(
    p.months.map((m) => [m.label, m.progress.total, m.progress.target, m.phase, m.status]),
    [
      ["October", 21, 20, "past", "complete"],
      ["November", 2, 30, "current", "behind-pace"],
      ["December", 0, 40, "upcoming", "upcoming"],
    ],
  );
  assert.equal(p.focus.label, "November");
  assert.equal(p.dayOfMonth, 15);
});

test("before and after the campaign", () => {
  const before = at("2030-09-20T04:00:00Z");
  assert.equal(before.phase, "before");
  assert.equal(before.focus.label, "October");
  assert.equal(before.focus.status, "upcoming");
  const after = at("2031-01-05T04:00:00Z");
  assert.equal(after.phase, "finished");
  assert.equal(after.focus.label, "December");
  assert.equal(after.focus.status, "closed");
});

test("the featured month follows the campaign time zone", () => {
  // 31 Oct 17:00 UTC is already 1 Nov in Singapore.
  assert.equal(at("2030-10-31T17:00:00Z").focus.label, "November");
  assert.equal(at("2030-10-31T15:00:00Z").focus.label, "October");
});

test("contributions are alphabetical (never ranked by count)", () => {
  const p = at("2030-10-20T04:00:00Z");
  assert.deepEqual(
    p.contributions.map((c) => [c.displayName, c.monthCases, c.campaignCases]),
    [["Jeremy", 6, 6], ["Mike", 12, 14], ["Sarah", 3, 3]],
  );
});

test("milestones are fractions of the overall target", () => {
  const p = at("2030-11-15T04:00:00Z");
  assert.deepEqual(p.milestones.map((m) => [m.percent, m.cases, m.reached]), [
    [25, 23, true], [50, 45, false], [75, 68, false], [100, 90, false],
  ]);
});

test("empty squad and empty counts", () => {
  const p = computeSquadProgress({ campaign, targets, members: [], counts: [], now: new Date("2030-10-02T04:00:00Z") });
  assert.equal(p.overall.total, 0);
  assert.equal(p.focus.status, "not-started");
  assert.deepEqual(p.contributions, []);
});

test("a campaign without targets is rejected", () => {
  assert.throws(() => computeSquadProgress({ campaign, targets: [], members, counts }));
});

test("current campaign selection uses the campaign time zone", () => {
  const next: Campaign = { ...campaign, id: "c2", startsOn: "2031-01-01", endsOn: "2031-03-31" };
  const newYearSg = new Date("2030-12-31T17:00:00Z");
  assert.equal(todayIn("Asia/Singapore", newYearSg), "2031-01-01");
  assert.equal(pickCurrentCampaign([campaign, next], newYearSg)?.id, "c2");
  assert.equal(pickCurrentCampaign([campaign, next], new Date("2030-11-15T04:00:00Z"))?.id, "c1");
  assert.equal(pickCurrentCampaign([campaign], new Date("2029-01-01T00:00:00Z"))?.id, "c1", "upcoming");
  assert.equal(pickCurrentCampaign([], new Date()), null);
});
