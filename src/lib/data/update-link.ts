import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isWellFormedUpdateToken } from "@/lib/update-token";

export type UpdateContext = {
  memberName: string;
  squadName: string;
  campaignName: string | null;
  month: string | null; // null when no campaign month is open
  caseCount: number;
};

/**
 * Resolves a private update link. The database hashes the token and finds its
 * member; returns null for malformed, unknown or revoked tokens alike.
 */
export async function getUpdateContext(token: string): Promise<UpdateContext | null> {
  if (!isWellFormedUpdateToken(token)) return null;
  const { data, error } = await createClient().rpc("get_update_context", { p_token: token });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    memberName: row.member_name,
    squadName: row.squad_name,
    campaignName: row.campaign_name,
    month: row.month,
    caseCount: row.case_count,
  };
}

export type SubmitResult =
  | { ok: true; month: string; caseCount: number }
  | { ok: false; reason: "invalid-link" | "no-open-month" | "invalid-count" | "unavailable" };

/** Sets the link owner's current total. The member is derived from the token only. */
export async function submitCaseCount(token: string, caseCount: number): Promise<SubmitResult> {
  if (!isWellFormedUpdateToken(token)) return { ok: false, reason: "invalid-link" };
  const { data, error } = await createClient().rpc("submit_case_count", {
    p_token: token,
    p_case_count: caseCount,
  });
  if (error) {
    if (error.code === "28000") return { ok: false, reason: "invalid-link" };
    if (error.code === "P0002") return { ok: false, reason: "no-open-month" };
    if (["23514", "22P02", "22004"].includes(error.code)) return { ok: false, reason: "invalid-count" };
    return { ok: false, reason: "unavailable" };
  }
  const row = data?.[0];
  if (!row) return { ok: false, reason: "unavailable" };
  return { ok: true, month: row.month, caseCount: row.case_count };
}
