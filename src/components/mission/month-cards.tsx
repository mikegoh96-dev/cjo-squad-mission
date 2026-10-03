"use client";

import { Crown3D, Rocket3D, Trophy3D } from "@/components/art/objects";
import { CheckIcon, LockIcon } from "@/components/icons";
import { Decor, Eyebrow, Meter } from "@/components/ui";
import { useOptionalLiveBoard } from "@/components/squad/live-board";
import { STATUS_LABEL, daysInMonth, missionProgress, missionStatus } from "@/lib/mission";
import type { MonthMission } from "@/lib/progress";

/** Mission stages: first month, then rising momentum, then the final month. */
const STAGE_OBJECTS = [Trophy3D, Rocket3D, Crown3D];

/** Each mission month's total vs target. State = icon + label, not colour alone. */
export function MonthCards({
  months: serverMonths,
  dayOfMonth,
  title = "Mission months",
}: {
  months: MonthMission[];
  dayOfMonth: number;
  title?: string;
}) {
  // On the dashboard the current month follows live taps; elsewhere it's as rendered.
  const live = useOptionalLiveBoard();
  const months = serverMonths.map((m) => {
    if (m.phase !== "current" || !live) return m;
    const total = live.total;
    const progress = missionProgress(total, m.progress.target);
    return { ...m, progress, status: missionStatus({ progress, phase: m.phase, dayOfMonth, daysInMonth: daysInMonth(m.month) }) };
  });
  return (
    <section aria-labelledby="months-title" className="animate-rise [animation-delay:120ms]">
      <Eyebrow className="px-1">
        <span id="months-title">{title}</span>
      </Eyebrow>
      <ul className="mt-3 flex flex-col gap-3">
        {months.map((m, i) => {
          const current = m.phase === "current";
          const done = m.progress.complete;
          const locked = m.phase === "upcoming";
          // One object per mission stage (by position, not by month name).
          const Obj = STAGE_OBJECTS[Math.min(i, STAGE_OBJECTS.length - 1)];
          return (
            <li
              key={m.month}
              data-testid={`month-${m.month}`}
              aria-current={current ? "true" : undefined}
              className={`relative isolate flex items-center gap-3 rounded-tile bg-surface p-3.5 pr-4 shadow-card ${
                current ? "ring-2 ring-accent/40" : ""
              }`}
            >
              {current ? (
                <Decor>
                  <span className="absolute -top-14 -left-12 size-44 rounded-full bg-[radial-gradient(circle,var(--accent-soft),transparent_70%)]" />
                </Decor>
              ) : null}
              <span className="relative shrink-0">
                <Obj className={`size-16 ${current ? "animate-float" : ""}`} muted={locked} />
                {done ? (
                  <span className="absolute -right-1 -bottom-0.5 flex size-6 items-center justify-center rounded-full bg-good text-white shadow-tile">
                    <CheckIcon className="size-3.5" />
                  </span>
                ) : locked ? (
                  <span className="absolute -right-1 -bottom-0.5 flex size-6 items-center justify-center rounded-full bg-surface text-muted shadow-tile">
                    <LockIcon className="size-3" />
                  </span>
                ) : null}
              </span>
              <div className="relative min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className={`text-[17px] font-extrabold ${locked ? "text-muted" : ""}`}>{m.label}</h3>
                  {current ? (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold tracking-wide text-accent-strong uppercase">
                      Now
                    </span>
                  ) : null}
                </div>
                {/* Status shares the count row so every bar spans the full width. */}
                <div className="flex items-baseline gap-2">
                  <p className="shrink-0 text-[15px] font-bold tabular-nums">
                    {m.progress.total} / {m.progress.target} cases
                  </p>
                  <span
                    className={`ml-auto min-w-0 text-right text-[12px] leading-tight font-bold ${
                      done ? "text-good-text" : current ? "text-accent-strong" : "text-muted"
                    }`}
                  >
                    {locked ? "Upcoming" : STATUS_LABEL[m.status]}
                  </span>
                </div>
                <div className="mt-1.5">
                  <Meter
                    size="sm"
                    value={locked ? 0 : m.progress.meterPercent}
                    complete={done}
                    label={`${m.label}: ${m.progress.total} of ${m.progress.target} cases`}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
