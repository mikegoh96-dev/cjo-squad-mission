import assert from "node:assert/strict";
import { test } from "node:test";
import { avatarKindFor } from "./avatars.ts";

test("Mike and JY get the man avatar, everyone else in the squad the woman avatar", () => {
  assert.equal(avatarKindFor("Mike"), "man");
  assert.equal(avatarKindFor("JY"), "man");
  for (const name of ["Claire", "Cynthia", "Jamie", "Jasmine"]) assert.equal(avatarKindFor(name), "woman");
});

test("matching ignores case and spaces; unknown names fall back to initials", () => {
  assert.equal(avatarKindFor(" jy "), "man");
  assert.equal(avatarKindFor("Someone New"), null);
});
