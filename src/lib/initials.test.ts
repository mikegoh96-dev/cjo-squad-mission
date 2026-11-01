import assert from "node:assert/strict";
import { test } from "node:test";
import { initialsFor, uniqueInitials } from "./initials.ts";

const ids = (names: string[]) => names.map((name, i) => ({ id: String(i), name }));
const asList = (names: string[]) => {
  const map = uniqueInitials(ids(names));
  return names.map((_, i) => map.get(String(i)));
};

test("a squad gets distinct initials", () => {
  assert.deepEqual(asList(["Chloe", "Jessica", "Jenny", "Marcus", "KJ"]), ["CH", "JS", "JN", "MR", "KJ"]);
});

test("natural initials", () => {
  assert.equal(initialsFor("Jenny"), "JN");
  assert.equal(initialsFor("Jessica"), "JS");
  assert.equal(initialsFor("Ben Tan"), "BT");
  assert.equal(initialsFor("kj"), "KJ");
  assert.equal(initialsFor("Al"), "AL");
  assert.equal(initialsFor("Aiea"), "AI"); // no consonant: first two letters
  assert.equal(initialsFor("   "), "?");
});

test("collisions fall back to the next candidate", () => {
  assert.deepEqual(asList(["Dane", "Dana"]), ["DA", "DN"]); // Dana (first by name) keeps DN
  assert.deepEqual(asList(["Dane Lim", "Dana Lim"]), ["DI", "DL"]);
  const all = asList(["Sam", "Sim", "Sum", "Som"]);
  assert.equal(new Set(all).size, 4);
});

test("identical names may share initials (nothing else to go on)", () => {
  assert.deepEqual(asList(["Jo", "Jo"]), ["JO", "JO"]);
});
