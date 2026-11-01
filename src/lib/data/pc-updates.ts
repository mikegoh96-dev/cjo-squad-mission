import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import type { PcEntry } from "@/lib/pc";
import { createClient } from "@/lib/supabase/server";

export type PcSubmitRow = { squadMemberId: string; status: "saved" | "unchanged" | "conflict"; amount: number };

export type PcSubmitResult =
  | { ok: true; rows: PcSubmitRow[] }
  | { ok: false; reason: "closed" | "invalid" | "unavailable" };

/**
 * Saves cumulative PC$ amounts through the only write path (submit_pc_amounts).
 * Each entry carries the amount the screen last confirmed; a member whose
 * stored amount changed since comes back as "conflict" (nothing written).
 */
export async function submitPcAmounts(challengeId: string, entries: PcEntry[]): Promise<PcSubmitResult> {
  const { data, error } = await createClient().rpc("submit_pc_amounts", {
    p_challenge_id: challengeId,
    p_entries: entries.map((e) => ({
      squad_member_id: e.squadMemberId,
      amount: e.amount,
      expected: e.expected,
    })) as Json,
  });
  if (error) {
    if (error.code === "P0002") return { ok: false, reason: "closed" };
    if (["42704", "23514", "22P02", "22004", "22023"].includes(error.code)) return { ok: false, reason: "invalid" };
    return { ok: false, reason: "unavailable" };
  }
  const rows: PcSubmitRow[] = [];
  for (const r of data ?? []) {
    if (r.status !== "saved" && r.status !== "unchanged" && r.status !== "conflict") return { ok: false, reason: "unavailable" };
    rows.push({ squadMemberId: r.squad_member_id, status: r.status, amount: r.amount });
  }
  if (rows.length !== entries.length) return { ok: false, reason: "unavailable" };
  return { ok: true, rows };
}
