import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { squadConfig } from "./squad.ts";

test("names and wording are filled in", () => {
  for (const key of ["appName", "shortName", "tagline", "description", "recapTitle"] as const) {
    assert.ok(squadConfig[key].trim().length > 0, `${key} is empty`);
  }
  for (const [key, value] of Object.entries(squadConfig.notifications)) {
    assert.ok(value.trim().length > 0, `notifications.${key} is empty`);
  }
  assert.ok(squadConfig.appName.length <= 40, "appName must fit the splash and the recap video (40 characters max)");
  assert.ok(squadConfig.shortName.length <= 15, "shortName shows under the Home Screen icon (15 characters max)");
});

test("recap file names are safe on every phone", () => {
  assert.match(squadConfig.fileSlug, /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/);
});

test("avatars use lowercase names and a known art style", () => {
  for (const [name, kind] of Object.entries(squadConfig.avatars)) {
    assert.equal(name, name.trim().toLowerCase(), `avatar key "${name}" must be lowercase`);
    assert.ok(kind === "man" || kind === "woman", `avatar for "${name}" must be "man" or "woman"`);
  }
});

test("the service worker's fallback notification title matches appName", () => {
  const sw = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
  assert.ok(
    sw.includes(`data.title || ${JSON.stringify(squadConfig.appName)}`),
    `public/sw.js: set the fallback title to ${JSON.stringify(squadConfig.appName)}`,
  );
});
