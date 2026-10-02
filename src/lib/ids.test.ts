import assert from "node:assert/strict";
import { test } from "node:test";
import { isUuid } from "./ids.ts";

test("accepts UUIDs", () => {
  assert.equal(isUuid("20000000-0000-0000-0000-00000000000b"), true);
  assert.equal(isUuid("7F9C2A8E-4D1B-4A91-8C4E-000000000001"), true);
});

test("rejects names, numbers and injection attempts", () => {
  for (const input of ["mike", "", "20000000-0000-0000-0000-00000000000", "20000000-0000-0000-0000-00000000000bb",
    "20000000-0000-0000-0000-00000000000b' or '1'='1", null, undefined, 42, {}]) {
    assert.equal(isUuid(input), false, String(input));
  }
});
