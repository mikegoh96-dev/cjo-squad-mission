import assert from "node:assert/strict";
import { test } from "node:test";
import { hasUnsavedTaps, isNewer, setUnsaved, shortVersion } from "./app-version.ts";

test("short version labels", () => {
  assert.equal(shortVersion("dpl_8f3k2a1Zq9"), "8f3k2a1");
  assert.equal(shortVersion("1e46e0b3c2d1"), "1e46e0b");
  assert.equal(shortVersion("local-1791364088553"), "1791364");
});

test("no update without a known version on both sides", () => {
  assert.equal(isNewer(null), false);
});

test("unsaved taps are tracked per card", () => {
  setUnsaved("a", true);
  setUnsaved("b", true);
  setUnsaved("a", false);
  assert.equal(hasUnsavedTaps(), true);
  setUnsaved("b", false);
  assert.equal(hasUnsavedTaps(), false);
});
