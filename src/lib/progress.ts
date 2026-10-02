// Squad progress for one campaign: pure, built on the mission maths. Every
// number is derived from campaign data and member counts; nothing about
// specific campaigns, months or years is hard-coded.
import {
  type MissionProgress,
  type MissionStatus,
  type MonthMilestone,
  type MonthPhase,
  daysInMonth,
  missionProgress,
  missionStatus,
  monthMilestones,
} from "./mission.ts";

export type Campaign = {
  id: string;
  name: string;
  startsOn: string; // YYYY-MM-DD
  endsOn: string; // YYYY-MM-DD
  timeZone: string;
};
export type MonthlyTarget = { month: string; targetCases: number }; // month = YYYY-MM-01
export type Member = { squadMemberId: string; displayName: string };
export type MemberCount = { squadMemberId: string; month: string; caseCount: number };

export type CampaignPhase = "before" | "active" | "finished";

export type MonthMission = {
  month: string;
  label: string;
  phase: MonthPhase;
  progress: MissionProgress;
  status: MissionStatus;
};

export type Contribution = {
  squadMemberId: string;
  displayName: string;
  /** Cases in the featured month. */
  monthCases: number;
  /** Cases across the whole campaign. */
  campaignCases: number;
};

export type SquadProgress = {
  phase: CampaignPhase;
  months: MonthMission[];
  /** The month the dashboard features: current, else next upcoming, else last. */
  focus: MonthMission;
  dayOfMonth: number;
  overall: MissionProgress;
  /** Milestones of the featured month. */
  milestones: MonthMilestone[];
  contributions: Contribution[];
};

/** Today's date (YYYY-MM-DD) in the given IANA time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Campaign covering today, else the next upcoming one, else the latest. */
export function pickCurrentCampaign(campaigns: Campaign[], now: Date = new Date()): Campaign | null {
  const withToday = campaigns.map((c) => ({ c, today: todayIn(c.timeZone, now) }));
  const active = withToday
    .filter(({ c, today }) => c.startsOn <= today && today <= c.endsOn)
    .sort((a, b) => b.c.startsOn.localeCompare(a.c.startsOn));
  if (active.length) return active[0].c;
  const upcoming = withToday
    .filter(({ c, today }) => c.startsOn > today)
    .sort((a, b) => a.c.startsOn.localeCompare(b.c.startsOn));
  if (upcoming.length) return upcoming[0].c;
  const past = [...campaigns].sort((a, b) => b.endsOn.localeCompare(a.endsOn));
  return past[0] ?? null;
}

export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(
    new Date(`${month}T00:00:00Z`),
  );
}

export function computeSquadProgress(input: {
  campaign: Campaign;
  targets: MonthlyTarget[];
  members: Member[];
  counts: MemberCount[];
  now?: Date;
}): SquadProgress {
  const { campaign, members } = input;
  const targets = [...input.targets].sort((a, b) => a.month.localeCompare(b.month));
  if (targets.length === 0) throw new Error("campaign has no monthly targets");

  const today = todayIn(campaign.timeZone, input.now);
  const todayMonth = `${today.slice(0, 7)}-01`;
  const dayOfMonth = Number(today.slice(8, 10));
  const phase: CampaignPhase =
    today < campaign.startsOn ? "before" : today > campaign.endsOn ? "finished" : "active";

  const memberIds = new Set(members.map((m) => m.squadMemberId));
  const counts = input.counts.filter((c) => memberIds.has(c.squadMemberId));
  const sum = (filter: (c: MemberCount) => boolean) =>
    counts.filter(filter).reduce((total, c) => total + c.caseCount, 0);

  const months: MonthMission[] = targets.map((t) => {
    const monthPhase: MonthPhase =
      t.month === todayMonth ? "current" : t.month < todayMonth ? "past" : "upcoming";
    const progress = missionProgress(sum((c) => c.month === t.month), t.targetCases);
    return {
      month: t.month,
      label: monthLabel(t.month),
      phase: monthPhase,
      progress,
      status: missionStatus({
        progress,
        phase: monthPhase,
        dayOfMonth,
        daysInMonth: daysInMonth(t.month),
      }),
    };
  });

  const focus =
    months.find((m) => m.phase === "current") ??
    months.find((m) => m.phase === "upcoming") ??
    months[months.length - 1];

  const overall = missionProgress(
    months.reduce((total, m) => total + m.progress.total, 0),
    months.reduce((total, m) => total + m.progress.target, 0),
  );

  const milestones = monthMilestones(focus.progress, focus.label);

  const campaignMonths = new Set(targets.map((t) => t.month));
  const contributions = members
    .map((m) => ({
      squadMemberId: m.squadMemberId,
      displayName: m.displayName,
      monthCases: sum((c) => c.squadMemberId === m.squadMemberId && c.month === focus.month),
      campaignCases: sum((c) => c.squadMemberId === m.squadMemberId && campaignMonths.has(c.month)),
    }))
    // Alphabetical, never by count: contributions are recognition, not a ranking.
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return { phase, months, focus, dayOfMonth, overall, milestones, contributions };
}
