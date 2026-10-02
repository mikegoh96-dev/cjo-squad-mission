import assert from "node:assert/strict";
import { test } from "node:test";
import { safeNextPath } from "./safe-next-path.ts";

test("keeps same-origin paths", () => {
  assert.equal(safeNextPath("/"), "/");
  assert.equal(safeNextPath("/squad?month=2026-10"), "/squad?month=2026-10");
});

test("uses the given fallback for unsafe targets", () => {
  assert.equal(safeNextPath("//evil.example", "/squad"), "/squad");
  assert.equal(safeNextPath(null, "/squad"), "/squad");
  assert.equal(safeNextPath("/squad/history", "/squad"), "/squad/history");
});

test("falls back to / for missing or external targets", () => {
  for (const input of [
    null,
    undefined,
    "",
    "squad",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
  ]) {
    assert.equal(safeNextPath(input), "/", `${String(input)} should fall back`);
  }
});
