import "server-only";
import { isUuid } from "@/lib/ids";
import { createClient } from "@/lib/supabase/server";

export type SubmitStatus = "saved" | "unchanged" | "conflict";

export type SubmitResult =
  | { ok: true; status: SubmitStatus; month: string; caseCount: number; previousCount: number }
  | { ok: false; reason: "unknown-member" | "no-open-month" | "invalid-count" | "unavailable" };

/**
 * Sets a squad member's CURRENT total for the open month through the only
 * write path (submit_case_count). `expectedCount` is the value the page showed;
 * if the stored value changed since, nothing is written and status is "conflict".
 */
export async function submitCaseCount(
  squadMemberId: string,
  caseCount: number,
  expectedCount: number | null,
): Promise<SubmitResult> {
  if (!isUuid(squadMemberId)) return { ok: false, reason: "unknown-member" };
  const { data, error } = await createClient().rpc("submit_case_count", {
    p_squad_member_id: squadMemberId,
    p_case_count: caseCount,
    ...(expectedCount === null ? {} : { p_expected_count: expectedCount }),
  });
  if (error) {
    if (error.code === "42704") return { ok: false, reason: "unknown-member" };
    if (error.code === "P0002") return { ok: false, reason: "no-open-month" };
    if (["23514", "22P02", "22004", "22023"].includes(error.code)) {
      return { ok: false, reason: "invalid-count" };
    }
    return { ok: false, reason: "unavailable" };
  }
  const row = data?.[0];
  if (!row || !["saved", "unchanged", "conflict"].includes(row.status)) {
    return { ok: false, reason: "unavailable" };
  }
  return {
    ok: true,
    status: row.status as SubmitStatus,
    month: row.month,
    caseCount: row.case_count,
    previousCount: row.previous_count,
  };
}
