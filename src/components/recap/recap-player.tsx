"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { type ArtProps, Bolt3D, Gem3D, Medal3D, Star3D, Trophy3D } from "@/components/art/objects";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  FlameIcon,
  PauseIcon,
  PlayIcon,
  ReplayIcon,
  ShareIcon,
  SkipIcon,
  UsersIcon,
  XIcon,
} from "@/components/icons";
import { Avatar, Meter } from "@/components/ui";
import { type MilestoneKey, formatDelta, pluralCases } from "@/lib/mission";
import { type Recap, type RecapPeriod, recapHeadline, recapSummaryText, weekdayShort } from "@/lib/recap";

export type ReadyRecap = Extract<Recap, { state: "ready" }>;

/** Where the squad stands now (for the "Next mission" scene); from the page's data. */
export type NextMission = {
  monthLabel: string;
  total: number;
  target: number;
  percent: number;
  meterPercent: number;
  remaining: number;
  complete: boolean;
  /** "2 more cases to unlock Momentum" / "Every milestone unlocked". */
  unlock: string;
  upcoming: boolean;
};

export type RecapContext = {
  squadId: string;
  campaign: { id: string; name: string; startsOn: string; endsOn: string; timeZone: string };
  targets: { month: string; targetCases: number }[];
  /** Every squad member, A–Z (appreciation only; never ranked or counted). */
  members: { id: string; name: string; initials: string }[];
  /** null once the campaign is over. */
  next: NextMission | null;
  overall: { total: number; target: number; percent: number; meterPercent: number; complete: boolean };
};

const SCENES = [
  { id: "opening", ms: 3500 },
  { id: "performance", ms: 5500 },
  { id: "milestones", ms: 4500 },
  { id: "thanks", ms: 4000 },
  { id: "next", ms: 5000 },
] as const;

const OBJECT: Record<MilestoneKey, (p: ArtProps) => React.ReactNode> = {
  started: Star3D,
  halfway: Medal3D,
  momentum: Bolt3D,
  cleared: Trophy3D,
};


/**
 * The immersive recap: five short scenes (about 22 s), then a summary card.
 * Pause / resume, back / next, skip to the summary, replay and close (× or
 * Escape). It pauses while the app is in the background. Reduced motion: no
 * movement (scenes swap without animation; numbers appear at their value).
 */
export function RecapPlayer({
  recap,
  ctx,
  onClose,
}: {
  recap: ReadyRecap;
  ctx: RecapContext;
  onClose: () => void;
}) {
  const [scene, setScene] = useState(0);
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState(0);
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const fills = useRef<(HTMLSpanElement | null)[]>([]);
  const elapsed = useRef(0);
  const done = scene >= SCENES.length;

  // Scene clock: fills the active segment and moves on when it's full.
  useEffect(() => {
    if (paused || done) return;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      elapsed.current += now - last;
      last = now;
      const p = Math.min(1, elapsed.current / SCENES[scene].ms);
      const el = fills.current[scene];
      if (el) el.style.transform = `scaleX(${p})`;
      if (p >= 1) {
        elapsed.current = 0;
        setScene((s) => s + 1);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene, paused, done, run]);

  // Pause while the app is hidden (switching apps, locking the phone).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") setPaused(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const goTo = (i: number) => {
    elapsed.current = 0;
    setScene(Math.max(0, Math.min(SCENES.length, i)));
  };
  const replay = () => {
    elapsed.current = 0;
    fills.current.forEach((el) => el && (el.style.transform = "scaleX(0)"));
    setPaused(false);
    setScene(0);
    setRun((r) => r + 1);
  };

  // Keyboard: Space pauses, arrows step (Escape is handled by the dialog).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (done) return;
      if (e.key === "ArrowRight") goTo(scene + 1);
      else if (e.key === "ArrowLeft") goTo(scene - 1);
      else if (e.key === " " && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const p = recap.period;
  return (
    <div
      className="bg-brand relative isolate flex h-full w-full flex-col overflow-hidden text-white"
      data-testid="recap-player"
      data-scene={done ? "summary" : SCENES[scene].id}
      data-paused={paused ? "true" : "false"}
      data-reduced={reduced ? "true" : "false"}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 size-[560px] -translate-x-1/2 bg-[repeating-conic-gradient(from_0deg,rgba(255,255,255,0.12)_0deg_7deg,transparent_7deg_20deg)] [mask-image:radial-gradient(circle,#000_0%,transparent_70%)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 size-[420px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.22),transparent_65%)]"
      />

      <div className="mx-auto w-full max-w-md px-4 pt-[max(14px,env(safe-area-inset-top))]">
        <div className="flex gap-1.5" aria-hidden="true">
          {SCENES.map((s, i) => (
            <span key={s.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/30">
              <span
                ref={(el) => {
                  fills.current[i] = el;
                }}
                className="block h-full origin-left rounded-full bg-white"
                style={{ transform: `scaleX(${done || i < scene ? 1 : 0})` }}
              />
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <p className="min-w-0 flex-1 text-[13px] leading-tight font-bold" data-testid="recap-period">
            <span className="block truncate">
              {p.title} · {p.kind === "week" ? "Weekly" : "Monthly"} recap
            </span>
            <span className="block truncate font-semibold text-white/80">
              {p.rangeLabel}
              {p.status === "in-progress" ? " · in progress" : ""}
            </span>
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close recap"
            data-testid="recap-close"
            data-autofocus
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/25"
          >
            <XIcon className="size-5" />
          </button>
        </div>
      </div>

      {done ? (
        <RecapSummary recap={recap} ctx={ctx} onReplay={replay} onClose={onClose} />
      ) : (
        <>
          <div
            key={`${run}-${scene}`}
            className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-4 text-center"
            aria-live="polite"
            data-testid={`recap-scene-${SCENES[scene].id}`}
          >
            <Scene id={SCENES[scene].id} recap={recap} ctx={ctx} reduced={reduced} />
          </div>
          <div className="mx-auto flex w-full max-w-md items-center justify-between gap-2 px-4 pt-2 pb-[max(16px,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-2">
              <RoundButton label="Previous scene" onClick={() => goTo(scene - 1)} disabled={scene === 0}>
                <ChevronLeftIcon className="size-5" />
              </RoundButton>
              <RoundButton
                label={paused ? "Resume recap" : "Pause recap"}
                onClick={() => setPaused((x) => !x)}
                testId="recap-pause"
              >
                {paused ? <PlayIcon className="size-5" /> : <PauseIcon className="size-5" />}
              </RoundButton>
              <RoundButton label="Next scene" onClick={() => goTo(scene + 1)} testId="recap-next">
                <ChevronRightIcon className="size-5" />
              </RoundButton>
            </div>
            <button
              type="button"
              onClick={() => goTo(SCENES.length)}
              data-testid="recap-skip"
              aria-label="Skip to summary"
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-4 text-[14px] font-bold whitespace-nowrap transition-colors hover:bg-white/25"
            >
              Skip<span className="max-[359px]:hidden"> to summary</span>
              <SkipIcon className="size-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function RoundButton({
  label,
  onClick,
  disabled,
  testId,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="flex size-11 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/25 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

const rise = (reduced: boolean, delay = 0) =>
  reduced ? {} : { className: "animate-rise", style: { animationDelay: `${delay}ms` } as React.CSSProperties };

function Scene({ id, recap, ctx, reduced }: { id: (typeof SCENES)[number]["id"]; recap: ReadyRecap; ctx: RecapContext; reduced: boolean }) {
  const p = recap.period;
  const unit = p.kind === "week" ? "week" : "month";

  if (id === "opening") {
    return (
      <>
        <Trophy3D className={`size-28 [@media(max-height:640px)]:size-20 ${reduced ? "" : "animate-float"}`} />
        <div {...rise(reduced, 80)}>
          <p className="mt-5 text-[12px] font-bold tracking-[0.14em] text-white/80 uppercase">
            {p.kind === "week" ? "Weekly" : "Monthly"} recap
          </p>
          <h2 className="mt-2 text-[32px] leading-[1.1] font-extrabold tracking-tight">Our squad&apos;s recap is here.</h2>
          <p className="mt-3 text-[16px] font-semibold text-white/85">
            {p.title} · {p.rangeLabel}
          </p>
          {p.status === "in-progress" ? (
            <p className="mt-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold">
              The {unit} isn&apos;t over yet: this is our story so far
            </p>
          ) : null}
        </div>
      </>
    );
  }

  if (id === "performance") {
    const max = Math.max(1, ...recap.days.map((d) => d.net));
    const single = recap.months.length === 1 ? recap.months[0] : null;
    return (
      <>
        <Gem3D className={`size-16 [@media(max-height:640px)]:hidden ${reduced ? "" : "animate-float"}`} />
        <h2 className="mt-3 text-[26px] leading-tight font-extrabold tracking-tight" data-testid="recap-headline">
          {recapHeadline(recap)}
        </h2>
        <p className="mt-2 text-[64px] leading-none font-extrabold tracking-tight tabular-nums" data-testid="recap-cases">
          {recap.casesAdded > 0 ? (
            <>
              +<AnimatedNumber value={recap.casesAdded} duration={1100} />
            </>
          ) : (
            formatDelta(recap.casesAdded)
          )}
        </p>
        <p className="mt-1 text-[14px] font-bold tracking-wide text-white/80 uppercase">
          {recap.casesAdded === 1 || recap.casesAdded === -1 ? "case" : "cases"} this {unit}
          {p.status === "in-progress" ? " so far" : ""}
        </p>
        {recap.updates === 0 ? (
          <p className="mt-3 text-[15px] text-white/85">No case updates were recorded in this period.</p>
        ) : null}

        <div className="mt-4 flex w-full flex-col gap-3 text-left">
          {recap.months.map((m) => (
            <div key={m.month} className="rounded-tile bg-white/12 p-3">
              <div className="flex items-baseline justify-between gap-2 text-[14px] font-bold">
                <span>{m.label}</span>
                <span className="tabular-nums">
                  {m.progress.total} / {m.target} · {m.progress.percent}%
                </span>
              </div>
              <div className="mt-2">
                <Meter
                  size="sm"
                  onBrand
                  value={m.progress.meterPercent}
                  label={`${m.label}: ${m.progress.total} of ${m.target} cases`}
                />
              </div>
              {recap.months.length > 1 ? (
                <p className="mt-1.5 text-[13px] text-white/85">{formatDelta(m.added)} in this {unit}</p>
              ) : null}
            </div>
          ))}
        </div>
        {single && single.shareOfTarget !== null ? (
          <p className="mt-3 text-[14px] font-semibold text-white/90">
            That&apos;s {single.shareOfTarget}% of the {single.label} target
          </p>
        ) : null}

        {recap.contributors > 0 || recap.activeDays > 0 ? (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {recap.contributors > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold">
                <UsersIcon className="size-4" />
                {recap.contributors} {recap.contributors === 1 ? "teammate" : "teammates"} added cases
              </span>
            ) : null}
            {recap.activeDays > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[13px] font-bold">
                <FlameIcon className="size-4" />
                Cases added on {recap.activeDays} {recap.activeDays === 1 ? "day" : "days"}
              </span>
            ) : null}
          </div>
        ) : null}

        {p.kind === "week" ? (
          <div
            role="img"
            aria-label={`Cases added each day: ${recap.days
              .filter((d) => !d.future)
              .map((d) => `${weekdayShort(d.date)} ${d.net}`)
              .join(", ")}`}
            className="mt-4 flex h-[68px] w-full items-end gap-1.5"
            data-testid="recap-days"
          >
            {recap.days.map((d) => (
              <span key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <span
                  className={`block w-full rounded-t-[4px] ${d.future ? "border border-dashed border-white/50" : "bg-white"}`}
                  style={{
                    height: `${d.net > 0 ? Math.max(6, (d.net / max) * 44) : 4}px`,
                    opacity: d.future ? 0.6 : d.net > 0 ? 1 : 0.35,
                  }}
                />
                <span className="text-[11px] font-bold text-white/80">{weekdayShort(d.date)}</span>
              </span>
            ))}
          </div>
        ) : null}
      </>
    );
  }

  if (id === "milestones") {
    if (recap.milestones.length === 0) {
      return (
        <>
          <Star3D className={`size-24 ${reduced ? "" : "animate-float"}`} />
          <h2 className="mt-4 text-[28px] leading-tight font-extrabold tracking-tight">Every case counts</h2>
          <p className="mt-2 text-[16px] text-white/85">
            {recap.updates === 0
              ? "Every milestone starts with a single case."
              : "No new milestones this time, and every update still moved us forward together."}
          </p>
        </>
      );
    }
    const shown = recap.milestones.slice(0, 4);
    return (
      <>
        <h2 className="text-[28px] leading-tight font-extrabold tracking-tight">
          {recap.milestones.length === 1 ? "Milestone unlocked" : "Milestones unlocked"}
        </h2>
        <p className="mt-1 text-[15px] text-white/85">Reached together in this {unit}</p>
        <ul className="mt-4 flex w-full flex-wrap justify-center gap-3" data-testid="recap-milestones">
          {shown.map((m, i) => {
            const Obj = OBJECT[m.key];
            return (
              <li
                key={`${m.month}-${m.key}`}
                className={`w-[calc(50%-6px)] rounded-tile bg-white/15 p-3 text-left ${reduced ? "" : "animate-pop"}`}
                style={reduced ? undefined : { animationDelay: `${120 + i * 140}ms` }}
              >
                <Obj className="-ml-1 size-14" />
                <p className="mt-1 text-[15px] leading-tight font-extrabold">{m.label}</p>
                <p className="mt-0.5 text-[12px] font-semibold text-white/80">
                  {pluralCases(m.cases)} · {m.monthLabel}
                </p>
              </li>
            );
          })}
        </ul>
        {recap.milestones.length > shown.length ? (
          <p className="mt-2 text-[13px] font-semibold text-white/85">and {recap.milestones.length - shown.length} more</p>
        ) : null}
      </>
    );
  }

  if (id === "thanks") {
    return (
      <>
        <h2 className="text-[30px] leading-tight font-extrabold tracking-tight">Thank you, squad</h2>
        <p className="mt-2 text-[16px] text-white/85">
          Every case, every update and every cheer moved us forward together.
        </p>
        <ul className="mt-5 flex flex-wrap justify-center gap-x-3 gap-y-3" aria-label="The squad">
          {ctx.members.map((m, i) => (
            <li
              key={m.id}
              className={`flex w-[72px] flex-col items-center gap-1 ${reduced ? "" : "animate-pop"}`}
              style={reduced ? undefined : { animationDelay: `${i * 90}ms` }}
            >
              <Avatar name={m.name} id={m.id} initials={m.initials} size="lg" />
              <span className="w-full truncate text-[13px] font-bold">{m.name}</span>
            </li>
          ))}
        </ul>
      </>
    );
  }

  // Next mission: where the squad stands now.
  const n = ctx.next;
  return (
    <>
      <p className="text-[12px] font-bold tracking-[0.14em] text-white/80 uppercase">Next mission</p>
      {n ? (
        <div className="mt-3 w-full rounded-tile bg-white/12 p-4 text-left">
          <p className="text-[20px] leading-tight font-extrabold" data-testid="recap-next-month">
            {n.upcoming
              ? `${n.monthLabel}: ${pluralCases(n.target)} to go`
              : n.complete
                ? `${n.monthLabel} cleared · ${pluralCases(n.total)}`
                : `${n.monthLabel}: ${pluralCases(n.remaining)} to go`}
          </p>
          <p className="mt-1 text-[14px] font-semibold text-white/85 tabular-nums">
            {n.total} of {n.target} cases · {n.percent}%
          </p>
          <div className="mt-2">
            <Meter size="sm" onBrand value={n.meterPercent} label={`${n.monthLabel}: ${n.total} of ${n.target} cases`} />
          </div>
          <p className="mt-2 text-[14px] font-bold">{n.unlock}</p>
        </div>
      ) : null}
      <div className="mt-3 w-full rounded-tile bg-white/12 p-4 text-left">
        <p className="text-[13px] font-bold text-white/85">{ctx.campaign.name}</p>
        <p className="mt-0.5 text-[20px] leading-tight font-extrabold tabular-nums" data-testid="recap-next-campaign">
          {ctx.overall.total} of {ctx.overall.target} cases together
        </p>
        <div className="mt-2">
          <Meter
            size="sm"
            onBrand
            value={ctx.overall.meterPercent}
            label={`Campaign progress: ${ctx.overall.total} of ${ctx.overall.target} cases`}
          />
        </div>
      </div>
      <p className="mt-5 text-[24px] leading-tight font-extrabold tracking-tight">One Squad. One Mission.</p>
      <p className="mt-1 text-[16px] font-semibold text-white/90">Let&apos;s keep the momentum going.</p>
    </>
  );
}

function RecapSummary({
  recap,
  ctx,
  onReplay,
  onClose,
}: {
  recap: ReadyRecap;
  ctx: RecapContext;
  onReplay: () => void;
  onClose: () => void;
}) {
  const p: RecapPeriod = recap.period;
  const unit = p.kind === "week" ? "week" : "month";
  const [shareNote, setShareNote] = useState<string | null>(null);
  // Offer only what this browser can really do: the share sheet, else copy.
  const canShare = typeof navigator.share === "function";
  const canCopy = typeof navigator.clipboard?.writeText === "function";
  const text = recapSummaryText(
    recap,
    ctx.next ? { monthLabel: ctx.next.monthLabel, total: ctx.next.total, target: ctx.next.target, remaining: ctx.next.upcoming ? ctx.next.target : ctx.next.remaining } : null,
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setShareNote("Summary copied");
    } catch {
      setShareNote("Couldn't copy on this device");
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: "CJO Squad Recap", text });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // closed the share sheet
      if (canCopy) await copy();
      else setShareNote("Couldn't share on this device");
    }
  };

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col overflow-y-auto px-4 py-4" data-testid="recap-summary">
      <section aria-labelledby="recap-summary-title" className="rounded-card bg-surface p-5 text-foreground shadow-card">
        <p className="text-[12px] font-bold tracking-[0.12em] text-muted uppercase">Recap summary</p>
        <h2 id="recap-summary-title" className="mt-1 text-[24px] leading-tight font-extrabold tracking-tight">
          {p.title}
        </h2>
        <p className="mt-0.5 text-[14px] text-muted">
          {p.rangeLabel}
          {p.status === "in-progress" ? " · in progress" : " · completed"}
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label={`Cases this ${unit}`} value={formatDelta(recap.casesAdded)} testId="recap-summary-cases" />
          <Stat label="Teammates added" value={String(recap.contributors)} />
          <Stat label="Active days" value={String(recap.activeDays)} />
        </dl>

        <div className="mt-4 flex flex-col gap-3">
          {recap.months.map((m) => (
            <div key={m.month}>
              <div className="flex items-baseline justify-between gap-2 text-[14px] font-bold">
                <span>{m.label}</span>
                <span className="tabular-nums">
                  {m.progress.total} / {m.target} · {m.progress.percent}%
                </span>
              </div>
              <div className="mt-1.5">
                <Meter
                  size="sm"
                  value={m.progress.meterPercent}
                  complete={m.progress.complete}
                  label={`${m.label}: ${m.progress.total} of ${m.target} cases`}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <p className="text-[13px] font-bold text-muted">Milestones in this {unit}</p>
          {recap.milestones.length ? (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {recap.milestones.map((m) => (
                <li
                  key={`${m.month}-${m.key}`}
                  className="rounded-full bg-accent-soft px-2.5 py-1 text-[13px] font-bold text-accent-strong"
                >
                  {m.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[14px]">No new milestones this time</p>
          )}
        </div>

        <div className="mt-4 rounded-tile bg-surface-2 p-3">
          <p className="text-[13px] font-bold text-muted">Next mission</p>
          {ctx.next ? (
            <p className="mt-0.5 text-[15px] font-bold">
              {ctx.next.monthLabel}: {ctx.next.total} of {ctx.next.target} cases · {ctx.next.unlock}
            </p>
          ) : null}
          <p className="mt-0.5 text-[14px] text-muted tabular-nums">
            {ctx.campaign.name}: {ctx.overall.total} of {ctx.overall.target} cases
          </p>
        </div>
        <p className="mt-4 text-center text-[15px] font-extrabold">One Squad. One Mission. Let&apos;s keep the momentum going.</p>
      </section>

      <div className="mt-4 flex flex-col gap-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          data-testid="recap-back"
          className="btn-3d btn-3d-brand flex h-12 items-center justify-center rounded-btn text-[16px] font-extrabold"
        >
          Back to Mission
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onReplay}
            data-testid="recap-replay"
            className="btn-3d btn-3d-soft flex h-12 items-center justify-center gap-2 rounded-btn text-[15px] font-bold"
          >
            <ReplayIcon className="size-4" />
            Replay
          </button>
          {canShare || canCopy ? (
            <button
              type="button"
              onClick={canShare ? share : copy}
              data-testid="recap-share"
              className="btn-3d btn-3d-soft flex h-12 items-center justify-center gap-2 rounded-btn text-[15px] font-bold"
            >
              {canShare ? <ShareIcon className="size-4" /> : <CopyIcon className="size-4" />}
              {canShare ? "Share" : "Copy summary"}
            </button>
          ) : null}
        </div>
        <p role="status" className="min-h-5 text-center text-[14px] font-semibold text-white" data-testid="recap-share-status">
          {shareNote}
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-tile bg-surface-2 px-1 py-2.5">
      <dd className="text-[22px] leading-none font-extrabold tabular-nums" data-testid={testId}>
        {value}
      </dd>
      <dt className="mt-1 text-[11px] leading-tight font-bold text-muted">{label}</dt>
    </div>
  );
}
