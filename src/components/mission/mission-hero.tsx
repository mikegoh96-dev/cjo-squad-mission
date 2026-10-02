import { AnimatedNumber } from "@/components/animated-number";
import { StatusPill } from "@/components/status-pill";
import { Card, Meter } from "@/components/ui";
import { remainingMessage } from "@/lib/mission";
import type { CampaignPhase, MonthMission } from "@/lib/progress";

/** The current month's mission: the dashboard's single hero figure. */
export function MissionHero({ focus, phase }: { focus: MonthMission; phase: CampaignPhase }) {
  const { progress, label, status } = focus;
  const eyebrow =
    phase === "before" ? `${label} mission · starts soon` : phase === "finished" ? `${label} mission · final` : `${label} mission`;

  return (
    <Card className="animate-rise" aria-labelledby="hero-title" data-testid="mission-hero">
      <div className="flex items-start justify-between gap-3">
        <h2 id="hero-title" className="pt-1.5 text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">
          {eyebrow}
        </h2>
        <StatusPill status={status} />
      </div>

      <p className="mt-4 flex items-baseline gap-2" data-testid="hero-count">
        <span className="text-[64px] leading-none font-semibold tracking-tight">
          <AnimatedNumber value={progress.total} />
        </span>
        <span className="text-2xl font-medium text-muted">/ {progress.target}</span>
        <span className="text-lg font-medium text-muted">cases</span>
      </p>

      <div className="mt-5">
        <Meter
          value={progress.meterPercent}
          complete={progress.complete}
          label={`${label} squad progress: ${progress.total} of ${progress.target} cases`}
        />
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <p className="text-xl font-semibold" data-testid="hero-percent">
          {progress.percent}%
        </p>
        <p className="text-right text-[15px] font-medium text-muted" data-testid="hero-remaining">
          {remainingMessage(progress, label)}
        </p>
      </div>
    </Card>
  );
}
