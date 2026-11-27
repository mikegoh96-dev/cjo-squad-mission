import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { pcStanding } from "./pc.ts";
import { PC_EVERYONE_LINE, type RecapPc, pcStatusLine, pcSummaryLine, recapPcFor, recapPcFrom } from "./recap-pc.ts";

const TZ = "Asia/Singapore";
const challenge = {
  id: "pc-test",
  name: "PC$ Challenge",
  eligibleFrom: "2026-11-01",
  eligibleTo: "2026-11-30",
  target: 120000,
  minimum: 5000,
  opensAt: "2026-10-31T16:00:00Z",
  closesAt: "2026-11-30T16:00:00Z",
};
const people = [
  { id: "a", name: "Chloe" },
  { id: "b", name: "Marcus" },
  { id: "c", name: "Jenny" },
];
const make = (amounts: Record<string, number | null>, phase: "open" | "closed" = "open") =>
  recapPcFrom(challenge, phase, pcStanding(challenge, people, amounts), TZ);

/** Everything the recap could show for a PC$ result. */
const shown = (pc: RecapPc) => [pcStatusLine(pc), pcSummaryLine(pc), pc.everyoneMinimum ? PC_EVERYONE_LINE : ""].join(" | ");

describe("recapPcFrom", () => {
  test("percentage only, floored; the month it belongs to", () => {
    const pc = make({ a: 30000, b: 29999, c: null }); // 59,999 / 120,000 = 49.99%
    assert.equal(pc.month, "2026-11-01");
    assert.equal(pc.monthLabel, "November");
    assert.equal(pc.percent, 49);
    assert.equal(pc.meterPercent, 49);
    assert.equal(pc.reached, false);
    assert.equal(pc.everyoneMinimum, false);
    assert.equal(pc.closed, false);
    assert.equal(pc.closesLabel, "30 Nov, 11:59pm");
    assert.deepEqual(Object.keys(pc).sort(), ["closed", "closesLabel", "everyoneMinimum", "meterPercent", "month", "monthLabel", "percent", "reached"]);
  });
  test("above the target: percent can pass 100, the meter stops at 100", () => {
    const pc = make({ a: 100000, b: 40000, c: 5000 }, "closed");
    assert.equal(pc.percent, 120);
    assert.equal(pc.meterPercent, 100);
    assert.equal(pc.reached, true);
    assert.equal(pc.everyoneMinimum, true);
  });
});

describe("wording", () => {
  test("open: so far, with the closing time", () => {
    assert.equal(pcStatusLine(make({ a: 60000 })), "So far · entries close 30 Nov, 11:59pm");
    assert.equal(pcSummaryLine(make({ a: 60000 })), "November PC$: 50% of our squad target (so far)");
  });
  test("reached (open or closed)", () => {
    assert.equal(pcStatusLine(make({ a: 120000 })), "Target reached! 🎯");
    assert.equal(pcStatusLine(make({ a: 120000 }, "closed")), "Target reached! 🎯");
    assert.equal(pcSummaryLine(make({ a: 120000 }, "closed")), "November PC$: 100% of our squad target · target reached 🎯");
  });
  test("closed and not reached: collective, never a failure", () => {
    const pc = make({ a: 108000 }, "closed");
    assert.equal(pcStatusLine(pc), "Together we reached 90% of our target");
    assert.equal(pcSummaryLine(pc), "November PC$: 90% of our squad target");
  });
  test("the minimum is mentioned only when every member reached it", () => {
    assert.ok(!shown(make({ a: 100000, b: 5000, c: 4999 })).toLowerCase().includes("minimum"));
    assert.ok(!shown(make({ a: 100000, b: 5000, c: null })).toLowerCase().includes("minimum"));
    const all = make({ a: 100000, b: 5000, c: 5000 });
    assert.ok(shown(all).includes(PC_EVERYONE_LINE));
    assert.equal(pcSummaryLine(all), "November PC$: 91% of our squad target (so far) · every member reached the individual minimum");
  });
  test("never a dollar amount, a member's name or a count of members", () => {
    for (const pc of [make({ a: 4000 }), make({ a: 120000, b: 5000, c: 5000 }, "closed"), make({ a: 50000 }, "closed")]) {
      const text = shown(pc);
      assert.doesNotMatch(text, /\$\s?\d/);
      assert.doesNotMatch(text, /\d{1,3},\d{3}/);
      for (const p of people) assert.ok(!text.includes(p.name), text);
      assert.doesNotMatch(text, /\b\d+ (of \d+ )?(members?|teammates?)\b/i);
    }
  });
});

describe("recapPcFor", () => {
  const pc = make({ a: 60000 });
  test("only the monthly recap of the challenge's month", () => {
    assert.equal(recapPcFor({ kind: "month", startDate: "2026-11-01" }, pc), pc);
    assert.equal(recapPcFor({ kind: "month", startDate: "2026-10-01" }, pc), null);
    assert.equal(recapPcFor({ kind: "month", startDate: "2026-12-01" }, pc), null);
    assert.equal(recapPcFor({ kind: "week", startDate: "2026-11-02" }, pc), null);
    assert.equal(recapPcFor({ kind: "month", startDate: "2026-11-01" }, null), null);
  });
});
