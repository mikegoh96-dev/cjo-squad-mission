// The PC$ challenge result as the Squad Recap and the recap video show it:
// squad level and PERCENTAGE ONLY (the video is made for public Instagram
// Stories). No dollar amounts, no member names, no count of who did or didn't
// reach the minimum. Pure and unit tested.

import { type PcChallenge, type PcPhase, type PcStanding, pcClosingLabel, pcMonthLabel } from "./pc.ts";

export type RecapPc = {
  /** The challenge's month, first day (YYYY-MM-01): the monthly recap it belongs to. */
  month: string;
  /** "November". */
  monthLabel: string;
  /** Squad total as a whole percent of the official target, rounded down (can exceed 100). */
  percent: number;
  /** percent capped at 100, for rings and meters. */
  meterPercent: number;
  /** The squad's saved total has reached the target. */
  reached: boolean;
  /** Every member is at the individual minimum (only ever shown when true). */
  everyoneMinimum: boolean;
  /** Entries are closed: the result is final. */
  closed: boolean;
  /** When entries close, e.g. "30 Nov, 11:59pm" (shown while open). */
  closesLabel: string;
};

/** Built on the server from the saved amounts; only these few fields reach the recap. */
export function recapPcFrom(challenge: PcChallenge, phase: PcPhase, standing: PcStanding, timeZone: string): RecapPc {
  return {
    month: `${challenge.eligibleFrom.slice(0, 7)}-01`,
    monthLabel: pcMonthLabel(challenge),
    percent: standing.progress.percent,
    meterPercent: standing.progress.meterPercent,
    reached: standing.progress.complete,
    everyoneMinimum: standing.allQualified,
    closed: phase === "closed",
    closesLabel: pcClosingLabel(challenge.closesAt, timeZone),
  };
}

/** The PC$ result for a recap period: only the monthly recap of the challenge's month. */
export function recapPcFor(period: { kind: "week" | "month"; startDate: string }, pc: RecapPc | null | undefined): RecapPc | null {
  return pc && period.kind === "month" && period.startDate === pc.month ? pc : null;
}

/** "Target reached! 🎯" / "So far · entries close 30 Nov, 11:59pm" / "Together we reached 90% of our target". */
export function pcStatusLine(pc: RecapPc): string {
  if (pc.reached) return "Target reached! 🎯";
  if (!pc.closed) return `So far · entries close ${pc.closesLabel}`;
  return `Together we reached ${pc.percent}% of our target`;
}

/** Shown only when it's true for everyone; otherwise the minimum isn't mentioned. */
export const PC_EVERYONE_LINE = "Every member reached the individual minimum ✓";

/** One line for the shared / copied recap summary. */
export function pcSummaryLine(pc: RecapPc): string {
  const tail = pc.reached ? " · target reached 🎯" : pc.closed ? "" : " (so far)";
  const everyone = pc.everyoneMinimum ? " · every member reached the individual minimum" : "";
  return `${pc.monthLabel} PC$: ${pc.percent}% of our squad target${tail}${everyone}`;
}
