"use client";

import { AnimatedNumber } from "@/components/animated-number";
import { StatusPill } from "@/components/status-pill";
import { Meter } from "@/components/ui";
import { daysInMonth, heroMessage, missionProgress, missionStatus, monthMilestones, nextMilestone } from "@/lib/mission";
import type { CampaignPhase, MonthMission } from "@/lib/progress";
import { useLiveBoard } from "@/components/squad/live-board";
import { Trophy3D } from "@/components/art/objects";

/** The visual hero: this month's collective count against the target (live). */
export function MissionHero({
  focus,
  phase,
  dayOfMonth,
}: {
  focus: MonthMission;
  phase: CampaignPhase;
  dayOfMonth: number;
}) {
  const { total } = useLiveBoard();
  const { label } = focus;
  const progress = missionProgress(total, focus.progress.target);
  const status = missionStatus({ progress, phase: focus.phase, dayOfMonth, daysInMonth: daysInMonth(focus.month) });
  const milestones = monthMilestones(progress, label);
  const next = nextMilestone(milestones);
  const markers = milestones
    .filter((m) => m.key !== "started" && m.cases < progress.target)
    .map((m) => Math.round((m.cases * 100) / progress.target))
    .filter((p) => p > 0);

  return (
    <section
      aria-labelledby="hero-title"
      data-testid="mission-hero"
      className="animate-rise relative mt-6 rounded-[32px] p-5 text-white shadow-[0_8px_0_-2px_var(--hero-lip),0_24px_40px_-18px_rgba(61,95,224,0.85)]"
    >
      {/* Decoration, clipped to the card: gradient, light rays, soft orbs, top highlight */}
      <div aria-hidden="true" className="bg-brand absolute inset-0 overflow-hidden rounded-[32px] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
        <div className="absolute -top-24 -right-20 size-80 bg-[repeating-conic-gradient(from_0deg,rgba(255,255,255,0.13)_0deg_7deg,transparent_7deg_20deg)] [mask-image:radial-gradient(circle,#000_0%,transparent_70%)]" />
        <div className="absolute -bottom-16 -left-10 size-44 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute top-24 -right-6 size-24 rounded-full bg-[#9d7bff]/30 blur-xl" />
      </div>
      {/* Original 3D trophy, breaking out of the card's top-right corner */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-9 -right-1 w-[118px] min-[400px]:w-[132px]">
        <div className="absolute inset-3 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.55),transparent_65%)]" />
        <Trophy3D className="animate-float relative w-full" />
      </div>

      <div className="relative flex flex-wrap items-center gap-2 pr-28">
        <h2
          id="hero-title"
          className="rounded-full bg-white/20 px-3 py-1 text-[12px] font-bold tracking-[0.12em] uppercase shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
        >
          {label} mission{phase === "before" ? " · starts soon" : phase === "finished" ? " · final" : ""}
        </h2>
        <StatusPill status={status} onBrand />
      </div>

      <p className="relative mt-5 flex flex-wrap items-baseline gap-x-2" data-testid="hero-count">
        <span
          className={`${progress.total >= 10000 ? "text-[56px]" : "text-[76px]"} leading-[0.9] font-extrabold tracking-tight tabular-nums [text-shadow:0_3px_0_rgba(26,36,110,0.35)]`}
        >
          <AnimatedNumber value={progress.total} />
        </span>
        <span className="text-[20px] font-bold text-white/85">/ {progress.target} cases</span>
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

    </section>
  );
}
