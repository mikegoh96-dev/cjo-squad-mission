import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_CASE_COUNT, parseCaseCount } from "./case-count.ts";

test("accepts whole numbers from 0 to the maximum", () => {
  for (const input of [0, 7, MAX_CASE_COUNT, "0", "7", " 13 ", "007"]) {
    const result = parseCaseCount(input);
    assert.equal(result.ok, true, `expected ${JSON.stringify(input)} to pass`);
  }
  assert.deepEqual(parseCaseCount("7"), { ok: true, value: 7 });
});

test("rejects negative numbers", () => {
  assert.equal(parseCaseCount(-1).ok, false);
  assert.equal(parseCaseCount("-1").ok, false);
});

test("rejects decimals", () => {
  for (const input of [6.5, "6.5", "7.0", 0.1]) {
    assert.equal(parseCaseCount(input).ok, false, `${input} should fail`);
  }
});

test("rejects values above the maximum", () => {
  assert.equal(parseCaseCount(MAX_CASE_COUNT + 1).ok, false);
  assert.equal(parseCaseCount("1001").ok, false);
  assert.equal(parseCaseCount("99999").ok, false);
});

test("rejects invalid strings and malformed input", () => {
  for (const input of [
    "",
    " ",
    "seven",
    "7abc",
    "1e2",
    "0x10",
    "+7",
    "7 8",
    Number.NaN,
    Number.POSITIVE_INFINITY,
    null,
    undefined,
    true,
    {},
    [7],
  ]) {
    assert.equal(
      parseCaseCount(input).ok,
      false,
      `${String(input)} should fail`,
    );
  }
});
