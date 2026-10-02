"use client";

import { CheckIcon, FlagIcon, LockIcon } from "@/components/icons";
import { Eyebrow, Ring } from "@/components/ui";
import { useLiveBoard } from "@/components/squad/live-board";
import { STATUS_LABEL, daysInMonth, missionProgress, missionStatus } from "@/lib/mission";
import type { MonthMission } from "@/lib/progress";

/** October / November / December mission cards. State = icon + label, not colour alone. */
export function MonthCards({ months: serverMonths, dayOfMonth }: { months: MonthMission[]; dayOfMonth: number }) {
  // The current month follows live taps; other months are as rendered.
  const { total } = useLiveBoard();
  const months = serverMonths.map((m) => {
    if (m.phase !== "current") return m;
    const progress = missionProgress(total, m.progress.target);
    return { ...m, progress, status: missionStatus({ progress, phase: m.phase, dayOfMonth, daysInMonth: daysInMonth(m.month) }) };
  });
  return (
    <section aria-labelledby="months-title" className="animate-rise [animation-delay:120ms]">
      <Eyebrow className="px-1">
        <span id="months-title">Mission months</span>
      </Eyebrow>
      <ul className="mt-3 flex flex-col gap-3">
        {months.map((m) => {
          const current = m.phase === "current";
          const done = m.progress.complete;
          const locked = m.phase === "upcoming";
          return (
            <li
              key={m.month}
              data-testid={`month-${m.month}`}
              aria-current={current ? "true" : undefined}
              className={`flex items-center gap-4 rounded-[24px] bg-surface p-4 shadow-card ${
                current ? "ring-2 ring-accent/35" : ""
              }`}
            >
              <Ring value={locked ? 0 : m.progress.meterPercent} tone={done ? "good" : locked ? "muted" : "accent"}>
                {done ? (
                  <CheckIcon className="size-6 text-good-text" />
                ) : locked ? (
                  <LockIcon className="size-5 text-muted" />
                ) : m.phase === "past" ? (
                  <FlagIcon className="size-5 text-muted" />
                ) : (
                  <span className="text-[13px] font-extrabold tabular-nums">{m.progress.percent}%</span>
                )}
              </Ring>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className={`text-[17px] font-bold ${locked ? "text-muted" : ""}`}>{m.label}</h3>
                  {current ? (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold tracking-wide text-accent-strong uppercase">
                      Now
                    </span>
                  ) : null}
                </div>
                <p className="text-[15px] font-semibold tabular-nums">
                  {locked ? `Target ${m.progress.target} cases` : `${m.progress.total} / ${m.progress.target} cases`}
                </p>
              </div>
              <span
                className={`shrink-0 text-right text-[13px] font-semibold ${
                  done ? "text-good-text" : current ? "text-accent-strong" : "text-muted"
                }`}
              >
                {locked ? "Upcoming" : STATUS_LABEL[m.status]}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
