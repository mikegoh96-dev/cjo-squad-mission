// Mission maths: pure, framework-free and unit tested. UI components only
// format what these functions return.

export type MissionProgress = {
  total: number;
  target: number;
  /** Whole percent, rounded DOWN so 100% only shows once the target is hit. */
  percent: number;
  /** percent capped at 100, for meters. */
  meterPercent: number;
  remaining: number;
  complete: boolean;
  exceededBy: number;
};

export type MonthPhase = "past" | "current" | "upcoming";

export type MissionStatus =
  | "upcoming"
  | "not-started"
  | "behind-pace"
  | "on-track"
  | "almost-there"
  | "complete"
  | "closed";

/** Share of the target at which a month counts as "almost there". */
export const ALMOST_THERE_PERCENT = 80;

function assertCount(value: number, name: string, { positive = false } = {}) {
  if (!Number.isInteger(value) || value < 0 || (positive && value === 0)) {
    throw new RangeError(`${name} must be a ${positive ? "positive" : "non-negative"} integer, got ${value}`);
  }
}

export function missionProgress(total: number, target: number): MissionProgress {
  assertCount(total, "total");
  assertCount(target, "target", { positive: true });
  const percent = Math.floor((total * 100) / target);
  return {
    total,
    target,
    percent,
    meterPercent: Math.min(percent, 100),
    remaining: Math.max(target - total, 0),
    complete: total >= target,
    exceededBy: Math.max(total - target, 0),
  };
}

/**
 * Status of one monthly mission, derived only from stored counts and the
 * campaign calendar. "On track" compares the total with an even pace through
 * the month so far.
 */
export function missionStatus(input: {
  progress: MissionProgress;
  phase: MonthPhase;
  dayOfMonth: number;
  daysInMonth: number;
}): MissionStatus {
  const { progress, phase, dayOfMonth, daysInMonth } = input;
  if (phase === "upcoming") return "upcoming";
  if (progress.complete) return "complete";
  if (phase === "past") return "closed";
  if (progress.total === 0) return "not-started";
  if (progress.percent >= ALMOST_THERE_PERCENT) return "almost-there";
  const expectedSoFar = (progress.target * dayOfMonth) / daysInMonth;
  return progress.total >= expectedSoFar ? "on-track" : "behind-pace";
}

export const STATUS_LABEL: Record<MissionStatus, string> = {
  upcoming: "Upcoming",
  "not-started": "Ready to start",
  "behind-pace": "Let's build momentum",
  "on-track": "Mission on track",
  "almost-there": "Almost there",
  complete: "Mission complete",
  closed: "Month closed",
};

export function pluralCases(n: number): string {
  return `${n} ${n === 1 ? "case" : "cases"}`;
}

/** e.g. "3 more cases to hit October" / "2 cases above target". */
export function remainingMessage(progress: MissionProgress, monthLabel: string): string {
  if (progress.exceededBy > 0) return `${pluralCases(progress.exceededBy)} above target`;
  if (progress.complete) return `${monthLabel} target hit`;
  return `${progress.remaining} more ${progress.remaining === 1 ? "case" : "cases"} to hit ${monthLabel}`;
}

/** Days in the month of a YYYY-MM-01 key. */
export function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "just now" / "5 min ago" / "3 h ago" / "2 days ago". */
export function relativeTime(from: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

// ---------------------------------------------------------------------------
// Monthly milestones: lightweight, collective markers on the way to a target.
// Defined as shares of the month's target so they follow the data.
// ---------------------------------------------------------------------------

export type MilestoneKey = "started" | "halfway" | "momentum" | "cleared";

export type MonthMilestone = { key: MilestoneKey; label: string; cases: number; reached: boolean };

/** First case, 50%, 75% and 100% of the month's target. */
export function monthMilestones(progress: MissionProgress, monthLabel: string): MonthMilestone[] {
  const { target, total } = progress;
  const steps: Array<[MilestoneKey, string, number]> = [
    ["started", "Mission started", 1],
    ["halfway", "Halfway there", Math.ceil(target / 2)],
    ["momentum", "Momentum", Math.ceil((target * 3) / 4)],
    ["cleared", `${monthLabel} cleared`, target],
  ];
  // Small targets can make steps coincide; keep the later (bigger) name.
  const byCases = new Map<number, [MilestoneKey, string]>();
  for (const [key, label, cases] of steps) byCases.set(cases, [key, label]);
  return [...byCases.entries()]
    .sort(([a], [b]) => a - b)
    .map(([cases, [key, label]]) => ({ key, label, cases, reached: total >= cases }));
}

/** The next milestone still to reach, or null when the month is cleared. */
export function nextMilestone(milestones: MonthMilestone[]): MonthMilestone | null {
  return milestones.find((m) => !m.reached) ?? null;
}

/**
 * The highest milestone crossed by moving the squad total from `before` to
 * `after` (only upward moves celebrate), or null.
 */
export function crossedMilestone(
  before: number,
  after: number,
  target: number,
  monthLabel: string,
): MonthMilestone | null {
  assertCount(before, "before");
  assertCount(after, "after");
  if (after <= before) return null;
  const crossed = monthMilestones(missionProgress(after, target), monthLabel).filter(
    (m) => m.cases > before && m.cases <= after,
  );
  return crossed.at(-1) ?? null;
}

// ---------------------------------------------------------------------------
// Team momentum (net change, so corrections count honestly)
// ---------------------------------------------------------------------------

/** "+6", "0", "−2" (true minus sign). */
export function formatDelta(n: number): string {
  if (!Number.isInteger(n)) throw new RangeError(`delta must be an integer, got ${n}`);
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

export function momentumHeadline(today: number, thisWeek: number): string {
  if (today > 0) return `${pluralCases(today)} added today`;
  if (thisWeek > 0) return `${pluralCases(thisWeek)} added this week`;
  return "Every case counts. Add the first one today.";
}

/** The hero line: "We're 3 cases away" — collective, never individual. */
export function heroMessage(progress: MissionProgress, phase: MonthPhase, monthLabel: string): string {
  if (phase === "upcoming") return `Starts 1 ${monthLabel} · ${pluralCases(progress.target)} to go`;
  if (progress.exceededBy > 0) return `${monthLabel} cleared · ${pluralCases(progress.exceededBy)} above target`;
  if (progress.complete) return `${monthLabel} cleared. We did it together!`;
  if (phase === "past") return `${monthLabel} closed ${progress.remaining} short`;
  return `We're ${pluralCases(progress.remaining)} away`;
}

/** "2 more cases to unlock Momentum" / "Every milestone unlocked". */
export function unlockMessage(progress: MissionProgress, next: MonthMilestone | null): string {
  if (!next) return "Every milestone unlocked";
  if (next.key === "started") return "One case starts the mission";
  const n = next.cases - progress.total;
  return `${n} more ${n === 1 ? "case" : "cases"} to unlock ${next.label}`;
}

export const ENCOURAGEMENT: Record<MissionStatus, string> = {
  complete: "Mission cleared!",
  "almost-there": "Final push!",
  "on-track": "Keep pushing",
  "behind-pace": "Let's build momentum",
  "not-started": "Let's get started",
  upcoming: "Get ready",
  closed: "Month closed",
};
