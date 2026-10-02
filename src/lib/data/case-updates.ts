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

export type RecentUpdate = { month: string; oldCount: number; newCount: number; changedAt: string };

/** A member's latest changes (newest first) so mistakes are easy to spot and fix. */
export async function getRecentUpdates(squadMemberId: string, limit = 5): Promise<RecentUpdate[]> {
  if (!isUuid(squadMemberId)) return [];
  const { data, error } = await createClient().rpc("member_recent_updates", {
    p_squad_member_id: squadMemberId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    month: r.month,
    oldCount: r.old_count,
    newCount: r.new_count,
    changedAt: r.changed_at,
  }));
}

/** The squad's total and target for one month, for the member's squad. */
export async function getSquadMonthForMember(
  squadMemberId: string,
  month: string,
): Promise<{ total: number; target: number } | null> {
  const supabase = createClient();
  const { data: membership } = await supabase
    .from("squad_members")
    .select("squad_id")
    .eq("id", squadMemberId)
    .maybeSingle();
  if (!membership) return null;
  const { data, error } = await supabase
    .from("squad_monthly_progress")
    .select("total_cases, target_cases")
    .eq("squad_id", membership.squad_id)
    .eq("month", month)
    .maybeSingle();
  if (error || !data || data.total_cases === null || data.target_cases === null) return null;
  return { total: data.total_cases, target: data.target_cases };
}
