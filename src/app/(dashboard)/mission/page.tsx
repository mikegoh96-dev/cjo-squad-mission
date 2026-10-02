import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AnimatedNumber } from "@/components/animated-number";
import { AppShell } from "@/components/app-shell";
import { Bolt3D, Medal3D, Star3D, Trophy3D } from "@/components/art/objects";
import { MilestoneBadges } from "@/components/mission/milestone-badges";
import { MonthCards } from "@/components/mission/month-cards";
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
      <Card className="animate-rise relative isolate flex flex-col items-center overflow-hidden text-center" aria-labelledby="mission-ring-title">
        <span aria-hidden="true" className="absolute -top-16 left-1/2 -z-10 size-64 -translate-x-1/2 rounded-full bg-accent-soft blur-2xl" />
        <Star3D className="animate-float pointer-events-none absolute top-4 right-4 size-12" />
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
          className="relative mt-4 flex items-center gap-2 rounded-2xl bg-flame-soft py-2 pr-4 pl-2 text-left text-[15px] font-bold text-flame-text shadow-tile"
          data-testid="mission-next"
        >
          <NextObject milestoneKey={next?.key} />
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

      <MonthCards months={progress.months} dayOfMonth={progress.dayOfMonth} title="Monthly totals" />

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

/** The 3D object of the milestone the squad is working towards. */
function NextObject({ milestoneKey }: { milestoneKey?: string }) {
  const Obj =
    milestoneKey === "started" ? Star3D : milestoneKey === "halfway" ? Medal3D : milestoneKey === "momentum" ? Bolt3D : Trophy3D;
  return <Obj className="size-10 shrink-0" />;
}
