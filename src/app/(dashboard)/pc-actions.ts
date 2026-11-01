"use server";

import { revalidatePath } from "next/cache";
import { type PcSubmitRow, submitPcAmounts } from "@/lib/data/pc-updates";
import { isUuid } from "@/lib/ids";
import { parsePcEntries } from "@/lib/pc";

export type SavePcResult =
  | { status: "done"; rows: PcSubmitRow[] }
  | { status: "error"; reason: "closed" | "invalid" | "unavailable" };

/**
 * Saves members' CUMULATIVE PC$ for a challenge in one go (shared link, no
 * login: the database cannot verify who is typing; see CLAUDE.md). Each entry
 * replaces that member's previous amount, unless it changed since this screen
 * last saw it ("conflict": nothing written for that member). Case counts are
 * never touched.
 */
export async function savePcAmounts(input: { challengeId: unknown; entries: unknown }): Promise<SavePcResult> {
  if (!isUuid(input.challengeId)) return { status: "error", reason: "invalid" };
  const entries = parsePcEntries(input.entries);
  if (!entries) return { status: "error", reason: "invalid" };

  const result = await submitPcAmounts(input.challengeId.toLowerCase(), entries);
  if (!result.ok) return { status: "error", reason: result.reason };
  // The Mission page's PC$ total and standings read the new amounts.
  if (result.rows.some((r) => r.status === "saved")) revalidatePath("/", "layout");
  return { status: "done", rows: result.rows };
}
