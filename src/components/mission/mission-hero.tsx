import Link from "next/link";
import { AnimatedNumber } from "@/components/animated-number";
import { PlusIcon } from "@/components/icons";
import { StatusPill } from "@/components/status-pill";
import { Meter } from "@/components/ui";
import { type MonthMilestone, heroMessage, nextMilestone } from "@/lib/mission";
import type { CampaignPhase, MonthMission } from "@/lib/progress";
import { TrophyArt } from "./trophy-art";

/** The visual hero: this month's collective count against the target. */
export function MissionHero({
  focus,
  phase,
  milestones,
}: {
  focus: MonthMission;
  phase: CampaignPhase;
  milestones: MonthMilestone[];
}) {
  const { progress, label } = focus;
  const next = nextMilestone(milestones);
  const canUpdate = focus.phase === "current";
  const markers = milestones
    .filter((m) => m.key !== "started" && m.cases < progress.target)
    .map((m) => Math.round((m.cases * 100) / progress.target))
    .filter((p) => p > 0);

  return (
    <section
      aria-labelledby="hero-title"
      data-testid="mission-hero"
      className="animate-rise bg-brand relative overflow-hidden rounded-[32px] p-5 pb-5 text-white shadow-[0_18px_40px_-18px_rgba(61,95,224,0.75)]"
    >
      <TrophyArt className="pointer-events-none absolute -top-2 -right-3 size-32 opacity-95" />
      <div className="relative flex flex-wrap items-center gap-2 pr-24">
        <h2
          id="hero-title"
          className="rounded-full bg-white/18 px-3 py-1 text-[12px] font-bold tracking-[0.12em] uppercase"
        >
          {label} mission{phase === "before" ? " · starts soon" : phase === "finished" ? " · final" : ""}
        </h2>
        <StatusPill status={focus.status} onBrand />
      </div>

      <p className="relative mt-5 flex flex-wrap items-baseline gap-x-2" data-testid="hero-count">
        <span
          className={`${progress.total >= 10000 ? "text-[56px]" : "text-[72px]"} leading-[0.9] font-extrabold tracking-tight tabular-nums`}
        >
          <AnimatedNumber value={progress.total} />
        </span>
        <span className="text-[20px] font-semibold text-white/85">/ {progress.target} cases</span>
      </p>
      <p className="relative mt-2 text-[19px] font-bold" data-testid="hero-remaining">
        {heroMessage(progress, focus.phase, label)}
      </p>

      <div className="relative mt-5">
        <Meter
          onBrand
          value={progress.meterPercent}
          label={`${label}: ${progress.total} of ${progress.target} cases`}
          markers={markers}
        />
        <div className="mt-2.5 flex items-center justify-between gap-3 text-[14px]">
          <span className="font-extrabold tabular-nums" data-testid="hero-percent">
            {progress.percent}%
          </span>
          <span className="truncate text-white/85" data-testid="hero-next">
            {next ? `Next: ${next.label} at ${next.cases}` : "Every milestone reached"}
          </span>
        </div>
      </div>

      {canUpdate ? (
        <Link
          href="/update"
          data-testid="update-cta"
          className="relative mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[17px] font-bold text-[#2f54d6] shadow-[0_8px_20px_-10px_rgba(0,0,0,0.35)] transition-transform active:scale-[0.98]"
        >
          <PlusIcon className="size-5" />
          Update my cases
        </Link>
      ) : null}
    </section>
  );
}
