import assert from "node:assert/strict";
import { test } from "node:test";
import { isWellFormedUpdateToken } from "./update-token.ts";

const valid = "7f9c2a8e4d1b6a91c4e8".padEnd(64, "0");

test("accepts 64 lowercase hex characters", () => {
  assert.equal(isWellFormedUpdateToken(valid), true);
});

test("rejects names, ids and malformed tokens", () => {
  for (const input of [
    "mike",
    "",
    valid.toUpperCase(),
    valid.slice(1),
    `${valid}0`,
    `${valid.slice(0, 63)}g`,
    "20000000-0000-0000-0000-00000000000b",
    `${valid}' or '1'='1`,
    null,
    undefined,
    42,
    [valid],
  ]) {
    assert.equal(isWellFormedUpdateToken(input), false, `${String(input)} should be rejected`);
  }
});
