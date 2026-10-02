"use server";

import { redirect } from "next/navigation";
import {
  type RecentUpdate,
  getRecentUpdates,
  getSquadMonthForMember,
  submitCaseCount,
} from "@/lib/data/case-updates";
import { isUuid } from "@/lib/ids";
import { crossedMilestone } from "@/lib/mission";
import { monthLabel } from "@/lib/progress";
import { forgetMember, rememberMember } from "@/lib/remembered-member";
import { parseCaseCount } from "@/lib/validation/case-count";

export type SaveResult =
  | {
      status: "saved" | "unchanged";
      caseCount: number;
      previousCount: number;
      squad: { total: number; target: number } | null;
      /** Squad milestone crossed by this save, to celebrate. */
      milestone: { label: string; cases: number } | null;
      recent: RecentUpdate[];
    }
  | { status: "conflict"; currentCount: number }
  | {
      status: "error";
      reason: "unknown-member" | "no-open-month" | "invalid-count" | "unavailable";
      message: string;
    };

const MESSAGES = {
  "unknown-member": "That name is no longer in the squad. Pick your name again.",
  "no-open-month": "There is no mission month open right now.",
  "invalid-count": "Enter a whole number of cases from 0 to 1000.",
  unavailable: "Couldn't save right now. Please try again.",
} as const;

const error = (reason: keyof typeof MESSAGES): SaveResult => ({ status: "error", reason, message: MESSAGES[reason] });

/**
 * Sets the chosen member's CURRENT total for the open month (shared link, no
 * login: the database cannot verify who is submitting; see CLAUDE.md).
 * `expectedCount` is the value the page showed; if it changed meanwhile the
 * result is "conflict" and nothing is written.
 */
export async function saveCaseCount(input: {
  squadMemberId: unknown;
  caseCount: unknown;
  expectedCount: unknown;
}): Promise<SaveResult> {
  if (!isUuid(input.squadMemberId)) return error("unknown-member");
  const squadMemberId = input.squadMemberId.toLowerCase();

  const parsed = parseCaseCount(input.caseCount);
  if (!parsed.ok) return error("invalid-count");

  const expected = input.expectedCount;
  if (expected !== null && !(Number.isInteger(expected) && (expected as number) >= 0)) {
    return error("invalid-count");
  }

  const result = await submitCaseCount(squadMemberId, parsed.value, expected as number | null);
  if (!result.ok) return error(result.reason);
  if (result.status === "conflict") return { status: "conflict", currentCount: result.caseCount };

  await rememberMember(squadMemberId); // next time "Update" opens straight to this member

  const [squad, recent] = await Promise.all([
    getSquadMonthForMember(squadMemberId, result.month).catch(() => null),
    getRecentUpdates(squadMemberId).catch(() => []),
  ]);
  const milestone =
    result.status === "saved" && squad
      ? crossedMilestone(
          Math.max(0, squad.total - (result.caseCount - result.previousCount)),
          squad.total,
          squad.target,
          monthLabel(result.month),
        )
      : null;

  return {
    status: result.status,
    caseCount: result.caseCount,
    previousCount: result.previousCount,
    squad,
    milestone: milestone ? { label: milestone.label, cases: milestone.cases } : null,
    recent,
  };
}

/** "Not you?": forget the remembered member and show the name picker. */
export async function switchMember() {
  await forgetMember();
  redirect("/update");
}
