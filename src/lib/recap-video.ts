// Monthly recap video: the report snapshot and the timeline. Pure and unit
// tested; the canvas composition (src/components/recap/video/) only draws
// what these return, so the preview and the exported file show the same
// numbers. All statistics come from computeRecap (src/lib/recap.ts).
import type { MilestoneKey } from "./mission.ts";
import type { Recap } from "./recap.ts";

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

export type VideoReport = {
  month: string;
  monthLabel: string;
  year: string;
  status: "in-progress" | "completed";
  /** "1 – 31 Oct 2026". */
  rangeLabel: string;
  /** The month's squad total at the end of the month (or now, while it runs). */
  total: number;
  /** Net cases added during the month (corrections count). */
  added: number;
  /** null when the month has no usable target: no percentage is shown then. */
  target: number | null;
  percent: number | null;
  meterPercent: number;
  complete: boolean;
  /** Never negative. */
  exceededBy: number;
  remaining: number;
  /** Milestones first reached during the month, in the order they were reached. */
  milestones: { key: MilestoneKey; label: string; cases: number }[];
  contributors: number;
  activeDays: number;
  campaign: { name: string; total: number; target: number; percent: number; meterPercent: number; complete: boolean } | null;
  /** "CJO-Squad-Recap-October-2026" (add .mp4 / .png). */
  fileBase: string;
};

/**
 * The report a monthly video shows, from a ready monthly recap. Returns null
 * if the recap isn't a monthly one (nothing is invented to fill the gap).
 */
export function buildVideoReport(recap: Recap, campaignName: string): VideoReport | null {
  if (recap.state !== "ready" || recap.period.kind !== "month") return null;
  const p = recap.period;
  const month = recap.months.find((m) => m.month === p.startDate) ?? null;
  const target = month && month.target > 0 ? month.target : null;
  const total = month ? month.progress.total : Math.max(0, recap.casesAdded);
  const percent = target ? Math.floor((total * 100) / target) : null;
  const monthLabel = recap.period.title;
  const year = p.startDate.slice(0, 4);
  return {
    month: p.startDate,
    monthLabel,
    year,
    status: p.status,
    rangeLabel: p.rangeLabel,
    total,
    added: recap.casesAdded,
    target,
    percent,
    meterPercent: percent === null ? 0 : Math.min(100, percent),
    complete: target !== null && total >= target,
    exceededBy: target !== null ? Math.max(0, total - target) : 0,
    remaining: target !== null ? Math.max(0, target - total) : 0,
    milestones: recap.milestones
      .filter((m) => m.month === p.startDate)
      .map((m) => ({ key: m.key, label: m.label, cases: m.cases })),
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
    fileBase: `CJO-Squad-Recap-${monthLabel}-${year}`.replace(/[^A-Za-z0-9-]/g, ""),
  };
}

/** The result line used on the closing frame and in shared text. */
export function resultLine(r: VideoReport): string {
  const cases = `${r.total} ${r.total === 1 ? "case" : "cases"}`;
  if (r.target === null || r.percent === null) return `${r.monthLabel} ${r.year} · ${cases}`;
  return `${r.monthLabel} ${r.year} · ${r.total} of ${r.target} cases · ${r.percent}%`;
}

/** "8 cases above target" / "Target hit!" / "6 cases to go" / null without a target. */
export function targetLine(r: VideoReport): string | null {
  if (r.target === null) return null;
  if (r.exceededBy > 0) return `${r.exceededBy} ${r.exceededBy === 1 ? "case" : "cases"} above target`;
  if (r.complete) return "Target hit!";
  return `${r.remaining} ${r.remaining === 1 ? "case" : "cases"} to go`;
}
