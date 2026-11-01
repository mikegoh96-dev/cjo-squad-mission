import assert from "node:assert/strict";
import { test } from "node:test";
import { squadConfig } from "../config/squad.ts";
import { avatarKindFor } from "./avatars.ts";

test("every member listed in the squad config gets their avatar, ignoring case and spaces", () => {
  for (const [name, kind] of Object.entries(squadConfig.avatars)) {
    assert.equal(avatarKindFor(name), kind);
    assert.equal(avatarKindFor(`  ${name.toUpperCase()} `), kind);
  }
});

test("unknown names fall back to initials", () => {
  assert.equal(avatarKindFor("Someone Not In The Config"), null);
  assert.equal(avatarKindFor(""), null);
});
