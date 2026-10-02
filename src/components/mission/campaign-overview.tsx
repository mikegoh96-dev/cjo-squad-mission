import { CheckIcon } from "@/components/icons";
import { Card, Eyebrow, Meter } from "@/components/ui";
import type { Milestone } from "@/lib/progress";
import type { MissionProgress } from "@/lib/mission";

/** Whole-campaign progress with milestone markers. */
export function CampaignOverview({
  campaignName,
  overall,
  milestones,
}: {
  campaignName: string;
  overall: MissionProgress;
  milestones: Milestone[];
}) {
  const next = milestones.find((m) => !m.reached);
  return (
    <Card className="animate-rise [animation-delay:160ms]" aria-labelledby="overall-title">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>
          <span id="overall-title">{campaignName}</span>
        </Eyebrow>
        <p className="text-[15px] font-semibold">{overall.percent}%</p>
      </div>
      <p className="mt-2 text-[28px] leading-tight font-semibold tracking-tight" data-testid="overall-count">
        {overall.total} <span className="text-lg font-medium text-muted">/ {overall.target} cases together</span>
      </p>
      <div className="mt-4">
        <Meter
          size="sm"
          value={overall.meterPercent}
          complete={overall.complete}
          label={`Campaign progress: ${overall.total} of ${overall.target} cases`}
          markers={milestones.filter((m) => m.percent < 100).map((m) => m.percent)}
        />
      </div>
      {/* Each label sits directly under its marker on the meter; 100% aligns to the end. */}
      <ul className="relative mt-2 h-6" aria-label="Milestones">
        {milestones.map((m) => (
          <li
            key={m.percent}
            style={m.percent < 100 ? { left: `${m.percent}%` } : { right: 0 }}
            className={`absolute top-0 flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
              m.percent < 100 ? "-translate-x-1/2" : ""
            } ${m.reached ? "bg-good-soft text-good-text" : "text-muted"}`}
          >
            {m.reached ? <CheckIcon className="size-3" /> : null}
            {m.percent}%
            <span className="sr-only">{m.reached ? " reached" : " not reached"} at {m.cases} cases</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[15px] text-muted">
        {next
          ? `Next milestone: ${next.cases} cases (${next.percent}%)`
          : "Every milestone reached. What a mission."}
      </p>
    </Card>
  );
}
