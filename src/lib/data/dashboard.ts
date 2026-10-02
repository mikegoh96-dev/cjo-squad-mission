import "server-only";
import { type SquadProgress, computeSquadProgress, pickCurrentCampaign } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";

export type Dashboard =
  | { state: "no-campaign" }
  | { state: "no-targets"; campaignName: string }
  | { state: "no-squad"; campaignName: string }
  | {
      state: "ready";
      campaignName: string;
      squadId: string;
      squadName: string;
      memberCount: number;
      progress: SquadProgress;
      momentum: Momentum;
      lastUpdatedAt: string | null;
    };

/** Net cases added to the squad (campaign time zone); corrections count. */
export type Momentum = { today: number; thisWeek: number };

/**
 * Public squad dashboard data. Read-only queries with the publishable key;
 * never selects anything private (raw history stays private; momentum is an
 * aggregate from squad_momentum).
 * V1 shows the single squad (the oldest one if several exist).
 */
export async function getDashboard(): Promise<Dashboard> {
  const supabase = createClient();

  // Two parallel round trips in total: (campaigns + targets, squad + members),
  // then (counts, momentum). Latency to the database dominates page time.
  const [campaignResult, squadResult] = await Promise.all([
    supabase.from("campaigns").select("id, name, starts_on, ends_on, time_zone, monthly_targets (month, target_cases)"),
    supabase
      .from("squads")
      .select("id, name, squad_members (id, members (display_name))")
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ]);
  if (campaignResult.error) throw campaignResult.error;
  if (squadResult.error) throw squadResult.error;
  const campaigns = campaignResult.data;

  const campaign = pickCurrentCampaign(
    campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      startsOn: c.starts_on,
      endsOn: c.ends_on,
      timeZone: c.time_zone,
    })),
  );
  if (!campaign) return { state: "no-campaign" };

  const targets = campaigns.find((c) => c.id === campaign.id)?.monthly_targets ?? [];
  const squad = squadResult.data;
  if (targets.length === 0) return { state: "no-targets", campaignName: campaign.name };
  if (!squad) return { state: "no-squad", campaignName: campaign.name };
  const memberships = squad.squad_members;

  const squadMemberIds = memberships.map((m) => m.id);
  const [countResult, momentumResult] = await Promise.all([
    squadMemberIds.length
      ? supabase
          .from("member_case_counts")
          .select("squad_member_id, month, case_count, updated_at")
          .eq("campaign_id", campaign.id)
          .in("squad_member_id", squadMemberIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc("squad_momentum", { p_squad_id: squad.id }),
  ]);
  if (countResult.error) throw countResult.error;
  if (momentumResult.error) throw momentumResult.error;
  const counts = countResult.data;
  const momentumRow = momentumResult.data?.[0];

  const progress = computeSquadProgress({
    campaign,
    targets: targets.map((t) => ({ month: t.month, targetCases: t.target_cases })),
    members: memberships.map((m) => ({ squadMemberId: m.id, displayName: m.members.display_name })),
    counts: counts.map((c) => ({
      squadMemberId: c.squad_member_id,
      month: c.month,
      caseCount: c.case_count,
    })),
  });

  const lastUpdatedAt =
    momentumRow?.last_change_at ??
    counts.reduce<string | null>(
      (latest, c) => (latest === null || c.updated_at > latest ? c.updated_at : latest),
      null,
    );

  return {
    state: "ready",
    campaignName: campaign.name,
    squadId: squad.id,
    squadName: squad.name,
    memberCount: memberships.length,
    progress,
    momentum: { today: momentumRow?.today ?? 0, thisWeek: momentumRow?.this_week ?? 0 },
    lastUpdatedAt,
  };
}
