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
      squadName: string;
      memberCount: number;
      progress: SquadProgress;
      lastUpdatedAt: string | null;
    };

/**
 * Public squad dashboard data. Read-only queries with the publishable key;
 * never selects anything private (no tokens, no history).
 * V1 shows the single squad (the oldest one if several exist).
 */
export async function getDashboard(): Promise<Dashboard> {
  const supabase = createClient();

  const { data: campaigns, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, name, starts_on, ends_on, time_zone");
  if (campaignError) throw campaignError;

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

  const [targets, squad] = await Promise.all([
    supabase.from("monthly_targets").select("month, target_cases").eq("campaign_id", campaign.id),
    supabase.from("squads").select("id, name").order("created_at").limit(1).maybeSingle(),
  ]);
  if (targets.error) throw targets.error;
  if (squad.error) throw squad.error;
  if (targets.data.length === 0) return { state: "no-targets", campaignName: campaign.name };
  if (!squad.data) return { state: "no-squad", campaignName: campaign.name };

  const { data: memberships, error: memberError } = await supabase
    .from("squad_members")
    .select("id, members (display_name)")
    .eq("squad_id", squad.data.id);
  if (memberError) throw memberError;

  const squadMemberIds = memberships.map((m) => m.id);
  const { data: counts, error: countError } = squadMemberIds.length
    ? await supabase
        .from("member_case_counts")
        .select("squad_member_id, month, case_count, updated_at")
        .eq("campaign_id", campaign.id)
        .in("squad_member_id", squadMemberIds)
    : { data: [], error: null };
  if (countError) throw countError;

  const progress = computeSquadProgress({
    campaign,
    targets: targets.data.map((t) => ({ month: t.month, targetCases: t.target_cases })),
    members: memberships.map((m) => ({ squadMemberId: m.id, displayName: m.members.display_name })),
    counts: counts.map((c) => ({
      squadMemberId: c.squad_member_id,
      month: c.month,
      caseCount: c.case_count,
    })),
  });

  const lastUpdatedAt = counts.reduce<string | null>(
    (latest, c) => (latest === null || c.updated_at > latest ? c.updated_at : latest),
    null,
  );

  return {
    state: "ready",
    campaignName: campaign.name,
    squadName: squad.data.name,
    memberCount: memberships.length,
    progress,
    lastUpdatedAt,
  };
}
