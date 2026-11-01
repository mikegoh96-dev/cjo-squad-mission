import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  PC_MAX,
  caretAfterDigits,
  formatPc,
  formatPcDigits,
  parsePcEntries,
  pcChanges,
  pcClosingLabel,
  pcDigits,
  pcDollars,
  pcDraftState,
  pcMonthLabel,
  pcPeriodLabel,
  pcPhase,
  pcQualification,
  pcStanding,
  qualificationLabel,
} from "./pc.ts";

const NOV = { target: 120000, minimum: 5000 };
const A = "20000000-0000-0000-0000-0000000000a1";
const B = "20000000-0000-0000-0000-0000000000b2";
const C = "20000000-0000-0000-0000-0000000000c3";

describe("typing", () => {
  test("keeps digits only: no $ or commas needed, cents dropped, no leading zeros", () => {
    assert.equal(pcDigits("8000"), "8000");
    assert.equal(pcDigits("$8,000"), "8000");
    assert.equal(pcDigits(" 12 500 "), "12500");
    assert.equal(pcDigits("$8,000.50"), "8000");
    assert.equal(pcDigits("0007"), "7");
    assert.equal(pcDigits("0"), "0");
    assert.equal(pcDigits("-500"), "500");
    assert.equal(pcDigits("abc"), "");
    assert.equal(pcDigits(""), "");
  });
  test("at most 9 digits", () => {
    assert.equal(pcDigits("12345678901"), "123456789");
  });
  test("thousands separators, the same in every browser", () => {
    assert.equal(formatPc(0), "0");
    assert.equal(formatPc(999), "999");
    assert.equal(formatPc(5000), "5,000");
    assert.equal(formatPc(123456), "123,456");
    assert.equal(formatPc(100000000), "100,000,000");
    assert.equal(pcDollars(8000), "$8,000");
    assert.equal(formatPcDigits("1234567"), "1,234,567");
    assert.equal(formatPcDigits(""), "");
  });
  test("the caret stays after the same digit when commas appear or move", () => {
    assert.equal(caretAfterDigits("1,234", 4), 5);
    assert.equal(caretAfterDigits("1,234", 1), 1);
    assert.equal(caretAfterDigits("1,234", 2), 3);
    assert.equal(caretAfterDigits("1,234", 0), 0);
    assert.equal(caretAfterDigits("12", 9), 2);
  });
});

describe("qualification", () => {
  test("below $5,000 shows what is left; $5,000 or more is achieved", () => {
    assert.deepEqual(pcQualification(3500, 5000), { met: false, remaining: 1500 });
    assert.deepEqual(pcQualification(5000, 5000), { met: true, remaining: 0 });
    assert.deepEqual(pcQualification(8000, 5000), { met: true, remaining: 0 });
    assert.deepEqual(pcQualification(null, 5000), { met: false, remaining: 5000 });
    assert.equal(qualificationLabel(pcQualification(3500, 5000)), "$1,500 to minimum");
    assert.equal(qualificationLabel(pcQualification(8000, 5000)), "Minimum achieved");
  });
});

describe("squad standing", () => {
  const members = [
    { id: A, name: "Aisha" },
    { id: B, name: "Ben" },
    { id: C, name: "Chloe" },
  ];
  test("total against the official target, used as is (no extra growth applied)", () => {
    const s = pcStanding(NOV, members, { [A]: 8000, [B]: 3500 });
    assert.equal(s.progress.total, 11500);
    assert.equal(s.progress.target, 120000);
    assert.equal(s.progress.percent, 9);
    assert.equal(s.progress.remaining, 108500);
    assert.equal(s.allQualified, false);
    assert.equal(s.complete, false);
    assert.deepEqual(s.members.map((m) => m.name), ["Aisha", "Ben", "Chloe"], "order as given (A–Z), never by amount");
    assert.equal(s.members[2].amount, null);
  });
  test("target reached but someone below the minimum: not complete", () => {
    const s = pcStanding(NOV, members, { [A]: 170000, [B]: 10000, [C]: 4999 });
    assert.equal(s.progress.complete, true);
    assert.equal(s.allQualified, false);
    assert.equal(s.complete, false);
  });
  test("everyone at the minimum but target not reached: not complete", () => {
    const s = pcStanding(NOV, members, { [A]: 5000, [B]: 5000, [C]: 5000 });
    assert.equal(s.allQualified, true);
    assert.equal(s.complete, false);
  });
  test("target reached and everyone at the minimum: complete", () => {
    const s = pcStanding(NOV, members, { [A]: 110000, [B]: 5000, [C]: 5000 });
    assert.equal(s.progress.total, 120000);
    assert.equal(s.complete, true);
  });
  test("amounts of people no longer in the squad are ignored; no members is never complete", () => {
    assert.equal(pcStanding(NOV, members.slice(0, 1), { [A]: 1000, [B]: 900000 }).progress.total, 1000);
    assert.equal(pcStanding({ target: 1, minimum: 0 }, [], {}).complete, false);
  });
});

describe("unsaved changes", () => {
  test("field state against the last saved amount", () => {
    assert.equal(pcDraftState(undefined, 8000), "clean");
    assert.equal(pcDraftState("", 8000), "clean", "an empty field is incomplete, never saved");
    assert.equal(pcDraftState("8000", 8000), "clean");
    assert.equal(pcDraftState("9000", 8000), "unsaved");
    assert.equal(pcDraftState("0", null), "unsaved");
    assert.equal(pcDraftState(String(PC_MAX + 1), null), "too-large");
  });
  test("only changed, complete, valid values are submitted, with what the screen last confirmed", () => {
    assert.deepEqual(
      pcChanges({ [A]: "9000", [B]: "3500", [C]: "", x: "999999999" }, { [A]: 8000, [B]: 3500 }),
      [{ squadMemberId: A, amount: 9000, expected: 8000 }],
    );
    assert.deepEqual(pcChanges({ [C]: "4200" }, {}), [{ squadMemberId: C, amount: 4200, expected: null }]);
  });
});

describe("server-side validation", () => {
  test("accepts whole, non-negative amounts for distinct members", () => {
    assert.deepEqual(parsePcEntries([{ squadMemberId: A.toUpperCase(), amount: 0, expected: null }]), [
      { squadMemberId: A, amount: 0, expected: null },
    ]);
  });
  test("rejects anything else", () => {
    const ok = { squadMemberId: A, amount: 1, expected: null };
    for (const bad of [
      null,
      [],
      "x",
      [{ ...ok, amount: -1 }],
      [{ ...ok, amount: 1.5 }],
      [{ ...ok, amount: "1" }],
      [{ ...ok, amount: PC_MAX + 1 }],
      [{ ...ok, expected: -1 }],
      [{ ...ok, expected: 2.5 }],
      [{ ...ok, squadMemberId: "marcus" }],
      [ok, { ...ok, amount: 2 }],
      Array.from({ length: 101 }, () => ok),
    ]) {
      assert.equal(parsePcEntries(bad), null, JSON.stringify(bad)?.slice(0, 80));
    }
  });
});

describe("calendar", () => {
  const nov = { opensAt: "2026-10-31T16:00:00Z", closesAt: "2026-11-30T16:00:00Z" };
  test("entries open 1 Nov 00:00 and close after 30 Nov 23:59:59 Singapore time", () => {
    assert.equal(pcPhase(nov, new Date("2026-10-31T23:59:59+08:00")), "before");
    assert.equal(pcPhase(nov, new Date("2026-11-01T00:00:00+08:00")), "open");
    assert.equal(pcPhase(nov, new Date("2026-11-30T23:59:59+08:00")), "open");
    assert.equal(pcPhase(nov, new Date("2026-12-01T00:00:00+08:00")), "closed");
  });
  test("labels", () => {
    assert.equal(pcMonthLabel({ eligibleFrom: "2026-11-01" }), "November");
    assert.equal(pcPeriodLabel("2026-11-01", "2026-11-30"), "1–30 Nov 2026");
    assert.equal(pcPeriodLabel("2026-10-15", "2026-11-14"), "15 Oct – 14 Nov 2026");
    assert.equal(pcPeriodLabel("2026-12-20", "2027-01-10"), "20 Dec 2026 – 10 Jan 2027");
    assert.equal(pcClosingLabel(nov.closesAt, "Asia/Singapore"), "30 Nov, 11:59pm");
    assert.equal(pcClosingLabel("2026-11-30T04:00:00Z", "Asia/Singapore"), "30 Nov, 11:59am");
    assert.equal(pcClosingLabel("2026-11-30T16:01:00Z", "Asia/Singapore"), "1 Dec, 12:00am");
  });
});
