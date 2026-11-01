import "server-only";
import { type PcChallenge, type PcPhase, pcPhase } from "@/lib/pc";
import { type SquadProgress, computeSquadProgress, pickCurrentCampaign } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";

export type Dashboard =
  | { state: "no-campaign" }
  | { state: "no-targets"; campaignName: string }
  | { state: "no-squad"; campaignName: string }
  | {
      state: "ready";
      campaignName: string;
      /** The current campaign's calendar (for recaps). */
      campaign: { id: string; startsOn: string; endsOn: string; timeZone: string };
      squadId: string;
      squadName: string;
      memberCount: number;
      progress: SquadProgress;
      momentum: Momentum;
      lastUpdatedAt: string | null;
      /** The current campaign's PC$ challenge (null if none, or not set up in the database yet). */
      pc: PcBoard | null;
    };

/** The latest PC$ challenge that has opened, with each member's cumulative amount. */
export type PcBoard = {
  challenge: PcChallenge;
  phase: PcPhase;
  /** squad member id -> saved cumulative amount (members without an entry are absent). */
  amounts: Record<string, number>;
};

/** Net cases added to the squad (campaign time zone); corrections count. */
export type Momentum = {
  today: number;
  thisWeek: number;
  /** Each member's net this week (squad member id -> cases); null if unavailable. */
  memberWeek: Record<string, number> | null;
};

/**
 * Public squad dashboard data. Read-only queries with the publishable key;
 * never selects anything private (raw history stays private; momentum is an
 * aggregate from squad_momentum).
 * V1 shows the single squad (the oldest one if several exist).
 */
export async function getDashboard(): Promise<Dashboard> {
  const supabase = createClient();

  // Two parallel round trips in total: (campaigns + targets, squad + members,
  // PC$ challenges + amounts), then (counts, momentum). Latency to the database
  // dominates page time.
  const [campaignResult, squadResult, pcResult] = await Promise.all([
    supabase.from("campaigns").select("id, name, starts_on, ends_on, time_zone, monthly_targets (month, target_cases)"),
    supabase
      .from("squads")
      .select("id, name, squad_members (id, members (display_name))")
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("pc_challenges")
      .select(
        "id, campaign_id, name, eligible_from, eligible_to, target_amount, member_minimum, opens_at, closes_at, member_pc_amounts (squad_member_id, amount)",
      )
      .order("opens_at", { ascending: false }),
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
  const [countResult, momentumResult, memberMomentumResult] = await Promise.all([
    squadMemberIds.length
      ? supabase
          .from("member_case_counts")
          .select("squad_member_id, month, case_count, updated_at")
          .eq("campaign_id", campaign.id)
          .in("squad_member_id", squadMemberIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc("squad_momentum", { p_squad_id: squad.id }),
    supabase.rpc("squad_member_momentum", { p_squad_id: squad.id }),
  ]);
  if (countResult.error) throw countResult.error;
  if (momentumResult.error) throw momentumResult.error;
  const counts = countResult.data;
  const momentumRow = momentumResult.data?.[0];
  // Per-member momentum is a nice-to-have: never fail the dashboard over it.
  const memberWeek = memberMomentumResult.error
    ? null
    : Object.fromEntries((memberMomentumResult.data ?? []).map((r) => [r.squad_member_id, r.this_week]));

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

  // PC$ is optional: never fail the dashboard over it (e.g. before its migration).
  const pc = pcResult.error ? null : pickPcBoard(pcResult.data, campaign.id);

  return {
    state: "ready",
    campaignName: campaign.name,
    campaign: { id: campaign.id, startsOn: campaign.startsOn, endsOn: campaign.endsOn, timeZone: campaign.timeZone },
    squadId: squad.id,
    squadName: squad.name,
    memberCount: memberships.length,
    progress,
    momentum: { today: momentumRow?.today ?? 0, thisWeek: momentumRow?.this_week ?? 0, memberWeek },
    lastUpdatedAt,
    pc,
  };
}

function pickPcBoard(
  rows: Array<{
    id: string;
    campaign_id: string;
    name: string;
    eligible_from: string;
    eligible_to: string;
    target_amount: number;
    member_minimum: number;
    opens_at: string;
    closes_at: string;
    member_pc_amounts: Array<{ squad_member_id: string; amount: number }>;
  }>,
  campaignId: string,
  now: Date = new Date(),
): PcBoard | null {
  // Newest first: the latest challenge of this campaign that has opened.
  const row = rows.find((r) => r.campaign_id === campaignId && Date.parse(r.opens_at) <= now.getTime());
  if (!row) return null;
  const challenge: PcChallenge = {
    id: row.id,
    name: row.name,
    eligibleFrom: row.eligible_from,
    eligibleTo: row.eligible_to,
    target: row.target_amount,
    minimum: row.member_minimum,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
  };
  return {
    challenge,
    phase: pcPhase(challenge, now),
    amounts: Object.fromEntries(row.member_pc_amounts.map((a) => [a.squad_member_id, a.amount])),
  };
}
