import assert from "node:assert/strict";
import { test } from "node:test";
import { isProtectedPath, loginPathFor } from "./routes.ts";

test("squad routes are protected", () => {
  for (const path of ["/squad", "/squad/", "/squad/history", "/squad/a/b"]) {
    assert.equal(isProtectedPath(path), true, `${path} should be protected`);
  }
});

test("public routes are not protected", () => {
  for (const path of [
    "/",
    "/login",
    "/auth/confirm",
    "/auth/error",
    "/squads",
    "/squadron",
  ]) {
    assert.equal(isProtectedPath(path), false, `${path} should be public`);
  }
});

test("login path carries the original destination", () => {
  assert.equal(loginPathFor("/squad"), "/login?next=%2Fsquad");
  assert.equal(
    loginPathFor("/squad/history?month=2026-11"),
    "/login?next=%2Fsquad%2Fhistory%3Fmonth%3D2026-11",
  );
});
