// Squad Recap maths: pure, framework-free and unit tested. The recap UI only
// formats what these functions return.
//
// Periods are whole local days in the campaign's time zone, end exclusive:
//   week  = Monday 00:00 -> next Monday 00:00
//   month = the 1st 00:00 -> the next 1st 00:00
// Every number comes from the recorded history of changes (net = new - old, so
// corrections count). The current total is never used as period activity; if
// the history doesn't add up to the stored totals, the numbers it can't
// support are reported as unavailable instead of guessed.
import {
  type MilestoneKey,
  type MissionProgress,
  formatDelta,
  missionProgress,
  monthMilestones,
  pluralCases,
} from "./mission.ts";
import { monthLabel, todayIn } from "./progress.ts";
import { squadConfig } from "../config/squad.ts";

export type RecapKind = "week" | "month";

export type RecapPeriod = {
  kind: RecapKind;
  /** Stable id, e.g. "week:2026-10-19" or "month:2026-10-01". */
  key: string;
  /** First local day (YYYY-MM-DD). */
  startDate: string;
  /** The local day after the last one (exclusive, YYYY-MM-DD). */
  endDate: string;
  /** Instants (ISO, UTC) of startDate 00:00 and endDate 00:00 in the time zone. */
  start: string;
  end: string;
  timeZone: string;
  status: "in-progress" | "completed";
  /** "This week", "Last week", "Week of 12 Oct", "October". */
  title: string;
  /** "Mon 19 Oct – Sun 25 Oct 2026" / "1 – 31 Oct 2026". */
  rangeLabel: string;
  /** "Mon 19 Oct, 00:00 to Mon 26 Oct, 00:00 (Singapore time)". */
  boundsLabel: string;
};

/** One recorded change, as squad_recap_history returns it (oldest first). */
export type HistoryEvent = { changedAt: string; month: string; delta: number; squadMemberId: string };

export type RecapMonth = {
  month: string;
  label: string;
  target: number;
  /** Net cases added to this month's mission during the period. */
  added: number;
  /** The month's squad total at the end of the period (or now, if still running). */
  progress: MissionProgress;
  /** Share of the month's target added in the period (whole %, rounded down); null if none. */
  shareOfTarget: number | null;
};

export type RecapMilestone = {
  month: string;
  monthLabel: string;
  key: MilestoneKey;
  label: string;
  cases: number;
  reachedAt: string;
};

export type RecapDay = { date: string; net: number; future: boolean };

export type Recap =
  | {
      state: "unavailable";
      period: RecapPeriod;
      /** history-incomplete: recorded changes don't add up to the stored totals. too-much-history: the page was full. */
      reason: "history-incomplete" | "too-much-history";
    }
  | {
      state: "ready";
      period: RecapPeriod;
      /** Net cases added in the period (corrections count). */
      casesAdded: number;
      /** Number of recorded changes in the period. */
      updates: number;
      /** Days in the period with cases added (net > 0). */
      activeDays: number;
      days: RecapDay[];
      /** Campaign months the period touches. */
      months: RecapMonth[];
      /** Milestones first reached during the period (each once), oldest first. */
      milestones: RecapMilestone[];
      /** Whole-campaign progress at the end of the period; null if some month's history is incomplete. */
      campaign: MissionProgress | null;
    };

// ---------------------------------------------------------------------------
// Calendar helpers (local dates as YYYY-MM-DD; arithmetic in UTC, no DST)
// ---------------------------------------------------------------------------

function parts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split("-").map(Number);
  return [y, m, d];
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = parts(ymd);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Monday of the week containing the date. */
export function mondayOf(ymd: string): string {
  const [y, m, d] = parts(ymd);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(ymd, -((weekday + 6) % 7));
}

export function nextMonth(monthKey: string): string {
  const [y, m] = parts(monthKey);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

/** Milliseconds the zone is ahead of UTC at an instant. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(f.find((p) => p.type === type)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return local - Math.floor(instant / 1000) * 1000;
}

/** The instant a local date starts (00:00) in the time zone. */
export function zonedMidnight(ymd: string, timeZone: string): Date {
  const [y, m, d] = parts(ymd);
  const asUtc = Date.UTC(y, m - 1, d);
  let t = asUtc - zoneOffsetMs(asUtc, timeZone);
  t = asUtc - zoneOffsetMs(t, timeZone); // second pass settles DST edges
  return new Date(t);
}

// Fixed English names: Intl output differs between engines ("Mon 19 Oct" vs
// "Mon, 19 Oct", "Sep" vs "Sept"), and the labels must read the same everywhere.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon" for a YYYY-MM-DD date. */
export function weekdayShort(ymd: string): string {
  const [y, m, d] = parts(ymd);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
const fmtDayMonth = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;
const fmtWeekdayDayMonth = (ymd: string) => `${weekdayShort(ymd)} ${fmtDayMonth(ymd)}`;
const fmtMonthYear = (ymd: string) => `${MONTHS[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(0, 4)}`;

/** "Singapore time" for Asia/Singapore. */
export function timeZoneLabel(timeZone: string): string {
  return `${(timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ")} time`;
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export function makePeriod(kind: RecapKind, startDate: string, timeZone: string, now: Date = new Date()): RecapPeriod {
  const endDate = kind === "week" ? addDays(startDate, 7) : nextMonth(startDate);
  const lastDay = addDays(endDate, -1);
  const today = todayIn(timeZone, now);
  const start = zonedMidnight(startDate, timeZone);
  const end = zonedMidnight(endDate, timeZone);
  const status = now.getTime() >= end.getTime() ? "completed" : "in-progress";
  const year = lastDay.slice(0, 4);

  let title: string;
  let rangeLabel: string;
  if (kind === "week") {
    const thisMonday = mondayOf(today);
    title =
      startDate === thisMonday
        ? "This week"
        : startDate === addDays(thisMonday, -7)
          ? "Last week"
          : `Week of ${fmtDayMonth(startDate)}`;
    rangeLabel = `${fmtWeekdayDayMonth(startDate)} – ${fmtWeekdayDayMonth(lastDay)} ${year}`;
  } else {
    title = monthLabel(startDate);
    rangeLabel = `${Number(startDate.slice(8, 10))} – ${Number(lastDay.slice(8, 10))} ${fmtMonthYear(lastDay)}`;
  }
  const boundsLabel = `${fmtWeekdayDayMonth(startDate)}, 00:00 to ${fmtWeekdayDayMonth(endDate)}, 00:00 (${timeZoneLabel(timeZone)})`;

  return {
    kind,
    key: `${kind}:${startDate}`,
    startDate,
    endDate,
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone,
    status,
    title,
    rangeLabel,
    boundsLabel,
  };
}

/**
 * The periods a recap can cover, newest first: this week and last week (when
 * they overlap the campaign), or every campaign month that has started. A
 * finished campaign offers its final weeks.
 */
export function recapPeriods(input: {
  kind: RecapKind;
  campaign: { startsOn: string; endsOn: string; timeZone: string };
  months: string[];
  now?: Date;
}): RecapPeriod[] {
  const now = input.now ?? new Date();
  const { startsOn, endsOn, timeZone } = input.campaign;
  const today = todayIn(timeZone, now);
  if (today < startsOn) return [];

  if (input.kind === "week") {
    const anchor = today > endsOn ? endsOn : today;
    const thisMonday = mondayOf(anchor);
    return [thisMonday, addDays(thisMonday, -7)]
      .filter((monday) => addDays(monday, 7) > startsOn && monday <= endsOn)
      .map((monday) => makePeriod("week", monday, timeZone, now));
  }
  const thisMonth = `${today.slice(0, 7)}-01`;
  return [...input.months]
    .filter((m) => m <= thisMonth)
    .sort((a, b) => b.localeCompare(a))
    .map((m) => makePeriod("month", m, timeZone, now));
}

// ---------------------------------------------------------------------------
// The recap itself
// ---------------------------------------------------------------------------

/** squad_recap_history returns at most this many rows; a full page may be cut short. */
export const HISTORY_PAGE_LIMIT = 5000;

export function computeRecap(input: {
  period: RecapPeriod;
  /** All of the campaign's recorded changes up to the time of fetching, oldest first. */
  events: HistoryEvent[];
  targets: { month: string; targetCases: number }[];
  /** Stored squad total per campaign month, read at the same time as the events. */
  storedTotals: Record<string, number>;
  /** Current squad members (removed members' history is gone with them). */
  memberIds: string[];
  now?: Date;
}): Recap {
  const { period } = input;
  if (input.events.length >= HISTORY_PAGE_LIMIT) return { state: "unavailable", period, reason: "too-much-history" };

  const start = Date.parse(period.start);
  const end = Date.parse(period.end);
  const members = new Set(input.memberIds);
  const events = input.events
    .filter((e) => members.has(e.squadMemberId))
    .map((e) => ({ ...e, at: Date.parse(e.changedAt) }));
  // Stable sort: the function already returns oldest first (ties by insert order).
  events.sort((a, b) => a.at - b.at);
  const targets = [...input.targets].sort((a, b) => a.month.localeCompare(b.month));

  // History is complete for a month when its recorded changes add up to the stored total.
  const complete = new Map<string, boolean>();
  for (const t of targets) {
    const recorded = events.filter((e) => e.month === t.month).reduce((sum, e) => sum + e.delta, 0);
    complete.set(t.month, recorded === (input.storedTotals[t.month] ?? 0));
  }

  const inPeriod = events.filter((e) => e.at >= start && e.at < end);
  // Months the period touches (by calendar), plus any month changed in it.
  const touched = targets.filter(
    (t) =>
      (t.month < period.endDate && nextMonth(t.month) > period.startDate) ||
      inPeriod.some((e) => e.month === t.month),
  );
  if (touched.some((t) => !complete.get(t.month))) {
    return { state: "unavailable", period, reason: "history-incomplete" };
  }

  const totalAtEnd = (month: string) =>
    events.filter((e) => e.month === month && e.at < end).reduce((sum, e) => sum + e.delta, 0);

  const months: RecapMonth[] = touched.map((t) => {
    const added = inPeriod.filter((e) => e.month === t.month).reduce((sum, e) => sum + e.delta, 0);
    return {
      month: t.month,
      label: monthLabel(t.month),
      target: t.targetCases,
      added,
      progress: missionProgress(Math.max(0, totalAtEnd(t.month)), t.targetCases),
      shareOfTarget: added > 0 ? Math.floor((added * 100) / t.targetCases) : null,
    };
  });

  const today = todayIn(period.timeZone, new Date(Math.min((input.now ?? new Date()).getTime(), end - 1)));
  const days: RecapDay[] = [];
  for (let d = period.startDate; d < period.endDate; d = addDays(d, 1)) {
    const dayStart = zonedMidnight(d, period.timeZone).getTime();
    const dayEnd = zonedMidnight(addDays(d, 1), period.timeZone).getTime();
    const dayNet = inPeriod.filter((e) => e.at >= dayStart && e.at < dayEnd).reduce((sum, e) => sum + e.delta, 0);
    days.push({ date: d, net: dayNet, future: period.status === "in-progress" && d > today });
  }

  const milestones: RecapMilestone[] = [];
  for (const t of targets) {
    const label = monthLabel(t.month);
    const steps = monthMilestones(missionProgress(0, t.targetCases), label);
    const reached = new Map<MilestoneKey, number>();
    let running = 0;
    for (const e of events) {
      if (e.month !== t.month) continue;
      running += e.delta;
      // First time only: dipping below and back again is not a new milestone.
      for (const s of steps) if (!reached.has(s.key) && running >= s.cases) reached.set(s.key, e.at);
    }
    for (const s of steps) {
      const at = reached.get(s.key);
      if (at !== undefined && at >= start && at < end) {
        milestones.push({
          month: t.month,
          monthLabel: label,
          key: s.key,
          label: s.label,
          cases: s.cases,
          reachedAt: new Date(at).toISOString(),
        });
      }
    }
  }
  milestones.sort((a, b) => a.reachedAt.localeCompare(b.reachedAt) || a.cases - b.cases);

  const allComplete = targets.every((t) => complete.get(t.month));
  const campaignTarget = targets.reduce((sum, t) => sum + t.targetCases, 0);
  const campaign =
    allComplete && campaignTarget > 0
      ? missionProgress(
          targets.reduce((sum, t) => sum + Math.max(0, totalAtEnd(t.month)), 0),
          campaignTarget,
        )
      : null;

  return {
    state: "ready",
    period,
    casesAdded: inPeriod.reduce((sum, e) => sum + e.delta, 0),
    updates: inPeriod.length,
    activeDays: days.filter((d) => d.net > 0).length,
    days,
    months,
    milestones,
    campaign,
  };
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** The headline for the performance scene. Collective, never individual. */
export function recapHeadline(recap: Extract<Recap, { state: "ready" }>): string {
  if (recap.updates === 0) {
    return recap.period.status === "in-progress" ? "Our story is just getting started" : "A quiet stretch for the squad";
  }
  if (recap.casesAdded > 0) return `${pluralCases(recap.casesAdded)} added together`;
  return "Counts tidied up together";
}

/** A short plain-text summary for sharing or copying. */
export function recapSummaryText(
  recap: Extract<Recap, { state: "ready" }>,
  next: { monthLabel: string; total: number; target: number; remaining: number } | null,
): string {
  const p = recap.period;
  const lines = [
    `${squadConfig.recapTitle} · ${p.title} (${p.rangeLabel}${p.status === "in-progress" ? ", in progress" : ""})`,
    recap.updates === 0 ? "No case updates recorded in this period." : `${formatDelta(recap.casesAdded)} cases together`,
  ];
  for (const m of recap.months) lines.push(`${m.label}: ${m.progress.total} of ${m.target} cases (${m.progress.percent}%)`);
  if (recap.milestones.length) lines.push(`Milestones: ${recap.milestones.map((m) => m.label).join(", ")}`);
  if (recap.campaign) lines.push(`Campaign: ${recap.campaign.total} of ${recap.campaign.target} cases`);
  if (next && next.remaining > 0) lines.push(`Next: ${pluralCases(next.remaining)} to clear ${next.monthLabel}`);
  lines.push("One Squad. One Mission. Let's keep the momentum going.");
  return lines.join("\n");
}
