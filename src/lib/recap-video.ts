// Recap video (weekly or monthly): the report snapshot and the timeline. Pure
// and unit tested; the canvas composition (src/components/recap/video/) only
// draws what these return, so the preview and the exported file show the same
// numbers. All statistics come from computeRecap (src/lib/recap.ts).
import { type MilestoneKey, formatDelta } from "./mission.ts";
import { type Recap, weekdayShort } from "./recap.ts";

/** Output format: Instagram Stories (9:16). Fixed here, never taken from the browser. */
export const VIDEO = { width: 1080, height: 1920, fps: 30 } as const;

export const VIDEO_SCENES = [
  { id: "opening", ms: 2800 },
  { id: "achievement", ms: 5000 },
  { id: "milestones", ms: 4600 },
  { id: "momentum", ms: 4200 },
  { id: "closing", ms: 4000 },
] as const;
export type VideoSceneId = (typeof VIDEO_SCENES)[number]["id"];

export const VIDEO_DURATION_MS = VIDEO_SCENES.reduce((sum, s) => sum + s.ms, 0);
export const VIDEO_FRAMES = Math.round((VIDEO_DURATION_MS * VIDEO.fps) / 1000);

/** The scene playing at a time (ms from the start), clamped to the video. */
export function sceneAt(ms: number): { index: number; id: VideoSceneId; local: number; duration: number } {
  let start = 0;
  const t = Math.max(0, Math.min(ms, VIDEO_DURATION_MS - 1));
  for (let i = 0; i < VIDEO_SCENES.length; i++) {
    const s = VIDEO_SCENES[i];
    if (t < start + s.ms) return { index: i, id: s.id, local: t - start, duration: s.ms };
    start += s.ms;
  }
  const last = VIDEO_SCENES.length - 1;
  return { index: last, id: VIDEO_SCENES[last].id, local: VIDEO_SCENES[last].ms - 1, duration: VIDEO_SCENES[last].ms };
}

/** Start time of a scene (ms). */
export function sceneStart(index: number): number {
  return VIDEO_SCENES.slice(0, index).reduce((sum, s) => sum + s.ms, 0);
}

type VideoCommon = {
  /** "This week", "Last week", "Week of 12 Oct", "October". */
  title: string;
  /** "October 2026" / "Mon 19 Oct – Sun 25 Oct 2026". */
  periodLabel: string;
  /** "1 – 31 Oct 2026" / "Mon 19 Oct – Sun 25 Oct 2026". */
  rangeLabel: string;
  status: "in-progress" | "completed";
  /** Net cases added during the period (corrections count). */
  added: number;
  /** Milestones first reached during the period, in the order they were reached. */
  milestones: { key: MilestoneKey; label: string; cases: number; monthLabel: string }[];
  contributors: number;
  activeDays: number;
  /** Whole-campaign progress at the end of the period (or now); null if unavailable. */
  campaign: { name: string; total: number; target: number; percent: number; meterPercent: number; complete: boolean } | null;
  /** e.g. "CJO-Squad-Recap-October-2026" (add .mp4 / .png). */
  fileBase: string;
};

export type MonthlyVideoReport = VideoCommon & {
  kind: "month";
  month: string;
  monthLabel: string;
  year: string;
  /** The month's squad total at the end of the month (or now, while it runs). */
  total: number;
  /** null when the month has no usable target: no percentage is shown then. */
  target: number | null;
  percent: number | null;
  meterPercent: number;
  complete: boolean;
  /** Never negative. */
  exceededBy: number;
  remaining: number;
};

/** A campaign month the week touches, as it stood at the end of the week. */
export type WeekMonthRow = {
  label: string;
  total: number;
  target: number;
  percent: number;
  meterPercent: number;
  complete: boolean;
  /** Net cases added to this month during the week. */
  added: number;
};

export type WeeklyVideoReport = VideoCommon & {
  kind: "week";
  startDate: string;
  months: WeekMonthRow[];
  /** Mon–Sun net per day; `future` = days of a running week still ahead. */
  days: { label: string; net: number; future: boolean }[];
  /** Share of the month's target added this week (single-month weeks only). */
  shareOfTarget: { percent: number; monthLabel: string } | null;
};

export type VideoReport = MonthlyVideoReport | WeeklyVideoReport;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const safeName = (s: string) => s.replace(/[^A-Za-z0-9-]/g, "");

/**
 * The report a recap video shows, from a ready weekly or monthly recap.
 * Returns null if the recap isn't ready (nothing is invented to fill the gap).
 */
export function buildVideoReport(recap: Recap, campaignName: string): VideoReport | null {
  if (recap.state !== "ready") return null;
  const p = recap.period;
  const common: Omit<VideoCommon, "periodLabel" | "fileBase"> = {
    title: p.title,
    rangeLabel: p.rangeLabel,
    status: p.status,
    added: recap.casesAdded,
    milestones: recap.milestones.map((m) => ({ key: m.key, label: m.label, cases: m.cases, monthLabel: m.monthLabel })),
    contributors: recap.contributors,
    activeDays: recap.activeDays,
    campaign: recap.campaign
      ? {
          name: campaignName,
          total: recap.campaign.total,
          target: recap.campaign.target,
          percent: recap.campaign.percent,
          meterPercent: recap.campaign.meterPercent,
          complete: recap.campaign.complete,
        }
      : null,
  };

  if (p.kind === "week") {
    const months = recap.months.map((m) => ({
      label: m.label,
      total: m.progress.total,
      target: m.target,
      percent: m.progress.percent,
      meterPercent: m.progress.meterPercent,
      complete: m.progress.complete,
      added: m.added,
    }));
    const single = recap.months.length === 1 ? recap.months[0] : null;
    const day = Number(p.startDate.slice(8, 10));
    const mon = MONTHS[Number(p.startDate.slice(5, 7)) - 1];
    return {
      ...common,
      kind: "week",
      startDate: p.startDate,
      periodLabel: p.rangeLabel,
      months,
      days: recap.days.map((d) => ({ label: weekdayShort(d.date), net: d.net, future: d.future })),
      shareOfTarget:
        single && single.shareOfTarget !== null ? { percent: single.shareOfTarget, monthLabel: single.label } : null,
      fileBase: safeName(`CJO-Squad-Recap-Week-of-${day}-${mon}-${p.startDate.slice(0, 4)}`),
    };
  }

  const month = recap.months.find((m) => m.month === p.startDate) ?? null;
  const target = month && month.target > 0 ? month.target : null;
  const total = month ? month.progress.total : Math.max(0, recap.casesAdded);
  const percent = target ? Math.floor((total * 100) / target) : null;
  const monthLabel = p.title;
  const year = p.startDate.slice(0, 4);
  return {
    ...common,
    kind: "month",
    milestones: recap.milestones
      .filter((m) => m.month === p.startDate)
      .map((m) => ({ key: m.key, label: m.label, cases: m.cases, monthLabel: m.monthLabel })),
    month: p.startDate,
    monthLabel,
    year,
    periodLabel: `${monthLabel} ${year}`,
    total,
    target,
    percent,
    meterPercent: percent === null ? 0 : Math.min(100, percent),
    complete: target !== null && total >= target,
    exceededBy: target !== null ? Math.max(0, total - target) : 0,
    remaining: target !== null ? Math.max(0, target - total) : 0,
    fileBase: safeName(`CJO-Squad-Recap-${monthLabel}-${year}`),
  };
}

const casesWord = (n: number) => (Math.abs(n) === 1 ? "case" : "cases");

/** The result line used on the closing frame and in the dialog. */
export function resultLine(r: VideoReport): string {
  if (r.kind === "week") {
    const [d, m, y] = [Number(r.startDate.slice(8, 10)), MONTHS[Number(r.startDate.slice(5, 7)) - 1], r.startDate.slice(0, 4)];
    return `Week of ${d} ${m} ${y} · ${formatDelta(r.added)} ${casesWord(r.added)} together`;
  }
  const cases = `${r.total} ${casesWord(r.total)}`;
  if (r.target === null || r.percent === null) return `${r.monthLabel} ${r.year} · ${cases}`;
  return `${r.monthLabel} ${r.year} · ${r.total} of ${r.target} cases · ${r.percent}%`;
}

/** "8 cases above target" / "Target hit!" / "6 cases to go" / null without a target. */
export function targetLine(r: MonthlyVideoReport): string | null {
  if (r.target === null) return null;
  if (r.exceededBy > 0) return `${r.exceededBy} ${casesWord(r.exceededBy)} above target`;
  if (r.complete) return "Target hit!";
  return `${r.remaining} ${casesWord(r.remaining)} to go`;
}
