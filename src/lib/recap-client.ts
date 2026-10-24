// Squad Recap data, read from the browser with the anon key (like
// notify-client.ts) so it never queues in front of a card's save. Two reads in
// parallel: the squad's recorded changes and the stored monthly totals, so the
// recap maths can check the history adds up before trusting it.
import type { HistoryEvent } from "@/lib/recap";
import { getBrowserClient } from "@/lib/supabase/browser";

export type RecapData = { events: HistoryEvent[]; storedTotals: Record<string, number> };

/** "unavailable" = the recap function isn't in the database yet; "failed" = network or server error. */
export class RecapLoadError extends Error {
  constructor(readonly kind: "unavailable" | "failed") {
    super(kind === "unavailable" ? "Recap is not available yet" : "Couldn't load the recap");
  }
}

export async function fetchRecapData(
  input: { squadId: string; campaignId: string; memberIds: string[] },
  signal?: AbortSignal,
): Promise<RecapData> {
  const supabase = getBrowserClient();
  const until = new Date().toISOString();
  let history, counts;
  try {
    [history, counts] = await Promise.all([
      supabase
        .rpc("squad_recap_history", { p_squad_id: input.squadId, p_campaign_id: input.campaignId, p_until: until })
        .abortSignal(signal ?? new AbortController().signal),
      input.memberIds.length
        ? supabase
            .from("member_case_counts")
            .select("month, case_count")
            .eq("campaign_id", input.campaignId)
            .in("squad_member_id", input.memberIds)
            .abortSignal(signal ?? new AbortController().signal)
        : Promise.resolve({ data: [] as { month: string; case_count: number }[], error: null }),
    ]);
  } catch {
    throw new RecapLoadError("failed");
  }
  if (history.error) throw new RecapLoadError(history.error.code === "PGRST202" ? "unavailable" : "failed");
  if (counts.error) throw new RecapLoadError("failed");

  const storedTotals: Record<string, number> = {};
  for (const c of counts.data ?? []) storedTotals[c.month] = (storedTotals[c.month] ?? 0) + c.case_count;
  return {
    events: (history.data ?? []).map((r) => ({
      changedAt: r.changed_at,
      month: r.month,
      delta: r.delta,
      squadMemberId: r.squad_member_id,
    })),
    storedTotals,
  };
}
