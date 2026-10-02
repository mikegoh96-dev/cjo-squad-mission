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
  "not-started": "Mission launched",
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
