// Pure squad-progress calculations. Every number is derived from campaign
// data and member counts; nothing about specific campaigns is hard-coded.

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

export type MonthStatus = "past" | "current" | "upcoming";

export type MonthProgress = {
  month: string;
  label: string;
  target: number;
  total: number;
  percent: number;
  remaining: number;
  achieved: boolean;
  status: MonthStatus;
};

export type Milestone = { percent: number; cases: number; reached: boolean };

export type Contribution = {
  squadMemberId: string;
  displayName: string;
  total: number;
  byMonth: Record<string, number>;
};

export type SquadProgress = {
  totalCases: number;
  overallTarget: number;
  percent: number;
  remaining: number;
  months: MonthProgress[];
  currentMonth: MonthProgress | null;
  contributions: Contribution[];
  milestones: Milestone[];
  stage: ProgressStage;
};

export type ProgressStage =
  | "launch"
  | "building"
  | "halfway"
  | "closing-in"
  | "final-push"
  | "accomplished";

/** Milestones as fractions of the overall target (product config, not data). */
export const MILESTONE_PERCENTS = [25, 50, 75, 100] as const;

/** Today's date (YYYY-MM-DD) in the given IANA time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Campaign covering `today`, else the next upcoming one, else the latest. */
export function pickCurrentCampaign(
  campaigns: Campaign[],
  now: Date = new Date(),
): Campaign | null {
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

export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10; // one decimal place
}

export function stageFor(percent: number): ProgressStage {
  if (percent >= 100) return "accomplished";
  if (percent >= 75) return "final-push";
  if (percent >= 50) return "closing-in";
  if (percent >= 25) return "halfway";
  if (percent > 0) return "building";
  return "launch";
}

export function computeSquadProgress(input: {
  campaign: Campaign;
  targets: MonthlyTarget[];
  members: Member[];
  counts: MemberCount[];
  now?: Date;
}): SquadProgress {
  const { campaign, members, counts } = input;
  const targets = [...input.targets].sort((a, b) => a.month.localeCompare(b.month));
  const currentMonthKey = `${todayIn(campaign.timeZone, input.now).slice(0, 7)}-01`;
  const memberIds = new Set(members.map((m) => m.squadMemberId));
  const relevant = counts.filter((c) => memberIds.has(c.squadMemberId));

  const months: MonthProgress[] = targets.map((t) => {
    const total = relevant
      .filter((c) => c.month === t.month)
      .reduce((sum, c) => sum + c.caseCount, 0);
    const status: MonthStatus =
      t.month === currentMonthKey ? "current" : t.month < currentMonthKey ? "past" : "upcoming";
    return {
      month: t.month,
      label: monthLabel(t.month),
      target: t.targetCases,
      total,
      percent: percentOf(total, t.targetCases),
      remaining: Math.max(t.targetCases - total, 0),
      achieved: total >= t.targetCases,
      status,
    };
  });

  const overallTarget = months.reduce((sum, m) => sum + m.target, 0);
  const totalCases = months.reduce((sum, m) => sum + m.total, 0);
  const percent = percentOf(totalCases, overallTarget);

  const contributions: Contribution[] = members
    .map((m) => {
      const byMonth = Object.fromEntries(
        targets.map((t) => [
          t.month,
          relevant
            .filter((c) => c.squadMemberId === m.squadMemberId && c.month === t.month)
            .reduce((sum, c) => sum + c.caseCount, 0),
        ]),
      );
      const total = Object.values(byMonth).reduce((sum, n) => sum + n, 0);
      return { squadMemberId: m.squadMemberId, displayName: m.displayName, total, byMonth };
    })
    // Alphabetical, never by count: contributions are recognition, not a ranking.
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const milestones = MILESTONE_PERCENTS.map((p) => {
    const cases = Math.ceil((overallTarget * p) / 100);
    return { percent: p, cases, reached: overallTarget > 0 && totalCases >= cases };
  });

  return {
    totalCases,
    overallTarget,
    percent,
    remaining: Math.max(overallTarget - totalCases, 0),
    months,
    currentMonth: months.find((m) => m.status === "current") ?? null,
    contributions,
    milestones,
    stage: stageFor(percent),
  };
}
