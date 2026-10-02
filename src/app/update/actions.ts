"use server";

import { redirect } from "next/navigation";
import { getSquadMonth, getUpdateContext, submitCaseCount } from "@/lib/data/update-link";
import { forgetToken, getRememberedToken, rememberToken } from "@/lib/remembered-link";
import { isWellFormedUpdateToken } from "@/lib/update-token";
import { parseCaseCount } from "@/lib/validation/case-count";

export type SaveResult =
  | {
      status: "saved" | "unchanged";
      caseCount: number;
      previousCount: number;
      squad: { total: number; target: number } | null;
    }
  | { status: "conflict"; currentCount: number }
  | {
      status: "error";
      reason: "invalid-link" | "no-open-month" | "invalid-count" | "unavailable";
      message: string;
    };

const MESSAGES = {
  "invalid-link": "This update link no longer works. Ask your squad lead for a new one.",
  "no-open-month": "There is no mission month open right now.",
  "invalid-count": "Enter a whole number of cases from 0 to 1000.",
  unavailable: "Couldn't save right now. Please try again.",
} as const;

const error = (reason: keyof typeof MESSAGES): SaveResult => ({ status: "error", reason, message: MESSAGES[reason] });

/**
 * Saves the link owner's CURRENT total for the open month.
 * - `token` comes from the personal link; when null, this device's remembered
 *   link (httpOnly cookie) is used. The member is ALWAYS derived from the token.
 * - `expectedCount` is the value the member saw; if it changed meanwhile the
 *   result is "conflict" and nothing is written.
 */
export async function saveCaseCount(input: {
  token: string | null;
  caseCount: unknown;
  expectedCount: unknown;
}): Promise<SaveResult> {
  const parsed = parseCaseCount(input.caseCount);
  if (!parsed.ok) return error("invalid-count");

  const expected = input.expectedCount;
  if (expected !== null && !(Number.isInteger(expected) && (expected as number) >= 0)) {
    return error("invalid-count");
  }

  const token = isWellFormedUpdateToken(input.token) ? input.token : await getRememberedToken();
  if (!token) return error("invalid-link");

  const result = await submitCaseCount(token, parsed.value, expected as number | null);
  if (!result.ok) return error(result.reason);
  if (result.status === "conflict") return { status: "conflict", currentCount: result.caseCount };

  await rememberToken(token); // this device now opens the update screen directly

  const context = await getUpdateContext(token).catch(() => null);
  const squad = context ? await getSquadMonth(context.squadName, result.month).catch(() => null) : null;
  return { status: result.status, caseCount: result.caseCount, previousCount: result.previousCount, squad };
}

/** Removes this device's remembered update link. */
export async function forgetDevice() {
  await forgetToken();
  redirect("/");
}
