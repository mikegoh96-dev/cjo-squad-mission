import assert from "node:assert/strict";
import { test } from "node:test";
import { CHEERS, applyTap, cheerFor, withLocalChanges } from "./board.ts";

test("taps never go below 0 or above 1000", () => {
  assert.equal(applyTap(0, -1), 0);
  assert.equal(applyTap(0, 1), 1);
  assert.equal(applyTap(5, -1), 4);
  assert.equal(applyTap(1000, 1), 1000);
  assert.equal(applyTap(999, 1), 1000);
});

test("cheers cycle deterministically", () => {
  assert.equal(cheerFor(0), CHEERS[0]);
  assert.equal(cheerFor(CHEERS.length), CHEERS[0]);
  assert.equal(cheerFor(-1), CHEERS[CHEERS.length - 1]);
  for (const c of CHEERS) assert.doesNotMatch(c, /#|rank|beat|win/i);
});

test("optimistic totals: server values plus local changes", () => {
  const server = { a: 3, b: 0, c: 5 };
  assert.deepEqual(withLocalChanges(server, {}), { counts: server, delta: 0, total: 8 });
  assert.deepEqual(withLocalChanges(server, { b: 2 }), { counts: { a: 3, b: 2, c: 5 }, delta: 2, total: 10 });
  assert.deepEqual(withLocalChanges(server, { a: 1, b: 2 }).delta, 0); // -2 + 2
  assert.equal(withLocalChanges(server, { zz: 9 }).total, 8, "unknown members ignored");
  // Once the server catches up, the local change no longer adds anything.
  assert.equal(withLocalChanges({ a: 3, b: 2, c: 5 }, { b: 2 }).delta, 0);
});
