"use server";

import { revalidatePath } from "next/cache";
import { submitCaseCount } from "@/lib/data/case-updates";
import { isUuid } from "@/lib/ids";
import { parseCaseCount } from "@/lib/validation/case-count";

export type SaveResult =
  | { status: "saved" | "unchanged"; caseCount: number; previousCount: number }
  | { status: "conflict"; currentCount: number }
  | { status: "error"; reason: "unknown-member" | "no-open-month" | "invalid-count" | "unavailable" };

/**
 * Sets a member's CURRENT total for the open month (shared link, no login: the
 * database cannot verify who is tapping; see CLAUDE.md). `expectedCount` is the
 * last total this screen confirmed; if the stored total changed since, nothing
 * is written and the result is "conflict".
 */
export async function saveCaseCount(input: {
  squadMemberId: unknown;
  caseCount: unknown;
  expectedCount: unknown;
}): Promise<SaveResult> {
  if (!isUuid(input.squadMemberId)) return { status: "error", reason: "unknown-member" };
  const parsed = parseCaseCount(input.caseCount);
  if (!parsed.ok) return { status: "error", reason: "invalid-count" };
  const expected = input.expectedCount;
  if (expected !== null && !(Number.isInteger(expected) && (expected as number) >= 0)) {
    return { status: "error", reason: "invalid-count" };
  }

  const result = await submitCaseCount(input.squadMemberId.toLowerCase(), parsed.value, expected as number | null);
  if (!result.ok) return { status: "error", reason: result.reason };
  if (result.status === "conflict") return { status: "conflict", currentCount: result.caseCount };

  // Purge cached pages so the Mission screen and momentum show the new total.
  if (result.status === "saved") revalidatePath("/", "layout");
  return { status: result.status, caseCount: result.caseCount, previousCount: result.previousCount };
}
