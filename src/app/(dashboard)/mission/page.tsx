import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AnimatedNumber } from "@/components/animated-number";
import { AppShell } from "@/components/app-shell";
import { FlameIcon } from "@/components/icons";
import { MilestoneBadges } from "@/components/mission/milestone-badges";
import { MissionJourney } from "@/components/mission/mission-journey";
import { StatusPill } from "@/components/status-pill";
import { Card, Eyebrow, Meter, Ring } from "@/components/ui";
import { getDashboard } from "@/lib/data/dashboard";
import { ENCOURAGEMENT, nextMilestone, remainingMessage, unlockMessage } from "@/lib/mission";

export const metadata: Metadata = { title: "Mission" };

/** The motivational view: this month's mission, its milestones and the journey. */
export default async function MissionPage() {
  await connection();
  const dashboard = await getDashboard();
  if (dashboard.state !== "ready") redirect("/");

  const { progress, campaignName } = dashboard;
  const { focus, milestones, overall } = progress;
  const next = nextMilestone(milestones);

  return (
    <AppShell eyebrow={`${focus.label} mission`} title={ENCOURAGEMENT[focus.status]}>
      <Card className="animate-rise flex flex-col items-center text-center" aria-labelledby="mission-ring-title">
        <h2 id="mission-ring-title" className="sr-only">
          {focus.label} progress
        </h2>
        <Ring value={focus.progress.meterPercent} size={208} stroke={18} tone={focus.progress.complete ? "good" : "accent"}>
          <span className="flex flex-col items-center">
            <span className="text-[64px] leading-none font-extrabold tracking-tight tabular-nums" data-testid="mission-count">
              <AnimatedNumber value={focus.progress.total} />
            </span>
            <span className="mt-1 text-[12px] font-bold tracking-[0.14em] text-muted uppercase">
              of {focus.progress.target} cases
            </span>
          </span>
        </Ring>
        <p className="mt-4 text-[22px] font-extrabold tabular-nums" data-testid="mission-percent">
          {focus.progress.percent}% complete
        </p>
        <p className="mt-1 text-[15px] text-muted">{remainingMessage(focus.progress, focus.label)}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <StatusPill status={focus.status} />
        </div>
        <p
          className="mt-4 flex items-center gap-2 rounded-2xl bg-flame-soft px-4 py-2.5 text-[15px] font-bold text-flame-text"
          data-testid="mission-next"
        >
          <FlameIcon className="size-5" />
          {unlockMessage(focus.progress, next)}
        </p>
      </Card>

      <section aria-labelledby="milestones-title" className="animate-rise [animation-delay:80ms]">
        <Eyebrow className="px-1">
          <span id="milestones-title">{focus.label} milestones</span>
        </Eyebrow>
        <div className="mt-3">
          <MilestoneBadges milestones={milestones} />
        </div>
      </section>

      <MissionJourney months={progress.months} />

      <Card className="animate-rise [animation-delay:160ms]" aria-labelledby="overall-title">
        <div className="flex items-baseline justify-between gap-3">
          <Eyebrow>
            <span id="overall-title">{campaignName}</span>
          </Eyebrow>
          <p className="text-[15px] font-bold tabular-nums">{overall.percent}%</p>
        </div>
        <p className="mt-2 text-[26px] leading-tight font-extrabold tracking-tight tabular-nums" data-testid="overall-count">
          {overall.total} <span className="text-[17px] font-semibold text-muted">/ {overall.target} cases together</span>
        </p>
        <div className="mt-3">
          <Meter
            size="sm"
            value={overall.meterPercent}
            complete={overall.complete}
            label={`Campaign progress: ${overall.total} of ${overall.target} cases`}
          />
        </div>
      </Card>
    </AppShell>
  );
}
