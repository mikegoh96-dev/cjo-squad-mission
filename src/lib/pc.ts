// PC$ challenge maths and formatting: pure and unit tested. PC$ is each
// member's CUMULATIVE production for the challenge (whole dollars), entered on
// their squad card. It is completely separate from case counts.

import { isUuid } from "./ids.ts";
import { type MissionProgress, missionProgress } from "./mission.ts";
import { monthLabel } from "./progress.ts";

/** Largest amount the database accepts (whole dollars). */
export const PC_MAX = 100_000_000;
const MAX_DIGITS = String(PC_MAX).length;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type PcChallenge = {
  id: string;
  name: string;
  /** Eligible production period, inclusive dates (YYYY-MM-DD). */
  eligibleFrom: string;
  eligibleTo: string;
  /** Official squad target, used as stored (any growth is already included). */
  target: number;
  /** Individual minimum. */
  minimum: number;
  /** Entries can be saved from opensAt until closesAt (exclusive). ISO timestamps. */
  opensAt: string;
  closesAt: string;
};

/**
 * What a PC$ field keeps from what was typed or pasted: digits only, no
 * leading zeros, cents dropped ("$8,000.50" -> "8000"), at most 9 digits.
 * Nobody needs to type "$" or commas.
 */
export function pcDigits(raw: string): string {
  const whole = raw.split(".")[0] ?? "";
  return whole.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, MAX_DIGITS);
}

/** 8000 -> "8,000" (fixed format: the same in every browser). */
export function formatPc(amount: number): string {
  return String(Math.trunc(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 8000 -> "$8,000". */
export function pcDollars(amount: number): string {
  return `$${formatPc(amount)}`;
}

/** Digits as shown in the field: "8000" -> "8,000", "" -> "". */
export function formatPcDigits(digits: string): string {
  return digits === "" ? "" : formatPc(Number(digits));
}

/** Where `caret` should go in `formatted` to sit after the same number of digits as before. */
export function caretAfterDigits(formatted: string, digitsBefore: number): number {
  if (digitsBefore <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) seen += 1;
    if (seen === digitsBefore) return i + 1;
  }
  return formatted.length;
}

export type PcQualification = { met: boolean; remaining: number };

/** Has this cumulative amount reached the individual minimum? No entry yet counts as $0. */
export function pcQualification(amount: number | null, minimum: number): PcQualification {
  const value = amount ?? 0;
  return { met: value >= minimum, remaining: Math.max(minimum - value, 0) };
}

/** "Minimum achieved" or "$1,500 to minimum". */
export function qualificationLabel(q: PcQualification): string {
  return q.met ? "Minimum achieved" : `${pcDollars(q.remaining)} to minimum`;
}

export type PcPhase = "before" | "open" | "closed";

export function pcPhase(challenge: Pick<PcChallenge, "opensAt" | "closesAt">, now: Date = new Date()): PcPhase {
  const t = now.getTime();
  if (t < Date.parse(challenge.opensAt)) return "before";
  return t < Date.parse(challenge.closesAt) ? "open" : "closed";
}

/** "November" (the month the eligible period starts in). */
export function pcMonthLabel(challenge: Pick<PcChallenge, "eligibleFrom">): string {
  return monthLabel(`${challenge.eligibleFrom.slice(0, 7)}-01`);
}

const dayMonth = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;

/** "1–30 Nov 2026", "15 Oct – 14 Nov 2026", "20 Dec 2026 – 10 Jan 2027". */
export function pcPeriodLabel(from: string, to: string): string {
  const [fy, fm] = [from.slice(0, 4), from.slice(5, 7)];
  const [ty, tm] = [to.slice(0, 4), to.slice(5, 7)];
  if (fy === ty && fm === tm) return `${Number(from.slice(8, 10))}–${dayMonth(to)} ${ty}`;
  if (fy === ty) return `${dayMonth(from)} – ${dayMonth(to)} ${ty}`;
  return `${dayMonth(from)} ${fy} – ${dayMonth(to)} ${ty}`;
}

/** The last minute entries are accepted, in the given time zone: "30 Nov, 11:59pm". */
export function pcClosingLabel(closesAt: string, timeZone: string): string {
  const last = new Date(Date.parse(closesAt) - 60_000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      day: "numeric",
      month: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(last)
      .map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]}, ${h12}:${parts.minute}${hour < 12 ? "am" : "pm"}`;
}

export type PcMemberStanding = { id: string; name: string; amount: number | null; qualification: PcQualification };

export type PcStanding = {
  /** Squad total against the official target. */
  progress: MissionProgress;
  /** Every member has reached the individual minimum. */
  allQualified: boolean;
  /** The challenge is complete: target reached AND everyone at the minimum. */
  complete: boolean;
  /** One row per member, in the order given (callers pass A–Z; never sorted by amount). */
  members: PcMemberStanding[];
};

export function pcStanding(
  challenge: Pick<PcChallenge, "target" | "minimum">,
  members: Array<{ id: string; name: string }>,
  amounts: Record<string, number | null | undefined>,
): PcStanding {
  const rows = members.map((m) => {
    const amount = amounts[m.id] ?? null;
    return { id: m.id, name: m.name, amount, qualification: pcQualification(amount, challenge.minimum) };
  });
  const total = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const progress = missionProgress(total, challenge.target);
  const allQualified = rows.length > 0 && rows.every((r) => r.qualification.met);
  return { progress, allQualified, complete: progress.complete && allQualified, members: rows };
}

export type PcEntry = { squadMemberId: string; amount: number; expected: number | null };

export type PcDraftState = "clean" | "unsaved" | "too-large";

/** A field's state: typed digits (undefined = untouched) against the last saved amount. */
export function pcDraftState(digits: string | undefined, saved: number | null): PcDraftState {
  if (digits === undefined || digits === "") return "clean";
  const value = Number(digits);
  if (value > PC_MAX) return "too-large";
  return value === saved ? "clean" : "unsaved";
}

/** Only the changed, complete, valid entries, each with the amount the screen last confirmed. */
export function pcChanges(drafts: Record<string, string>, saved: Record<string, number | null>): PcEntry[] {
  return Object.entries(drafts)
    .filter(([id, digits]) => pcDraftState(digits, saved[id] ?? null) === "unsaved")
    .map(([id, digits]) => ({ squadMemberId: id, amount: Number(digits), expected: saved[id] ?? null }));
}

/** Validates entries from the browser (server side). Null if anything is off. */
export function parsePcEntries(input: unknown): PcEntry[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) return null;
  const seen = new Set<string>();
  const out: PcEntry[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) return null;
    const { squadMemberId, amount, expected } = raw as Record<string, unknown>;
    if (!isUuid(squadMemberId)) return null;
    const id = squadMemberId.toLowerCase();
    if (seen.has(id)) return null;
    seen.add(id);
    if (!Number.isInteger(amount) || (amount as number) < 0 || (amount as number) > PC_MAX) return null;
    if (expected !== null && !(Number.isInteger(expected) && (expected as number) >= 0)) return null;
    out.push({ squadMemberId: id, amount: amount as number, expected: expected as number | null });
  }
  return out;
}
