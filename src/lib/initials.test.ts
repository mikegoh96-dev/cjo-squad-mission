import assert from "node:assert/strict";
import { test } from "node:test";
import { initialsFor, uniqueInitials } from "./initials.ts";

const ids = (names: string[]) => names.map((name, i) => ({ id: String(i), name }));
const asList = (names: string[]) => {
  const map = uniqueInitials(ids(names));
  return names.map((_, i) => map.get(String(i)));
};

test("the CJO squad gets distinct initials", () => {
  assert.deepEqual(asList(["Claire", "Jasmine", "Jamie", "Mike", "JY"]), ["CL", "JS", "JM", "MK", "JY"]);
});

test("natural initials", () => {
  assert.equal(initialsFor("Jamie"), "JM");
  assert.equal(initialsFor("Jasmine"), "JS");
  assert.equal(initialsFor("Mike Goh"), "MG");
  assert.equal(initialsFor("jy"), "JY");
  assert.equal(initialsFor("Al"), "AL");
  assert.equal(initialsFor("Aiea"), "AI"); // no consonant: first two letters
  assert.equal(initialsFor("   "), "?");
});

test("collisions fall back to the next candidate", () => {
  assert.deepEqual(asList(["Mike", "Mika"]), ["MI", "MK"]); // Mika (first by name) keeps MK
  assert.deepEqual(asList(["Mike Tan", "Mary Tan"]), ["MA", "MT"]);
  const all = asList(["Sam", "Sim", "Sum", "Som"]);
  assert.equal(new Set(all).size, 4);
});

test("identical names may share initials (nothing else to go on)", () => {
  assert.deepEqual(asList(["Jo", "Jo"]), ["JO", "JO"]);
});
