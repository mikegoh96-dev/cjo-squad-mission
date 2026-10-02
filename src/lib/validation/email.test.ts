import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEmail } from "./email.ts";

test("accepts and trims valid email addresses", () => {
  assert.equal(parseEmail("mike@example.com"), "mike@example.com");
  assert.equal(parseEmail("  sarah.t+cjo@mail.example.sg "), "sarah.t+cjo@mail.example.sg");
});

test("rejects invalid email input", () => {
  for (const input of [
    "",
    "   ",
    "mike",
    "mike@",
    "@example.com",
    "mike@example",
    "mi ke@example.com",
    `${"a".repeat(250)}@example.com`,
    null,
    undefined,
    42,
  ]) {
    assert.equal(parseEmail(input), null, `${String(input)} should fail`);
  }
});
