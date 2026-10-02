import { CheckIcon, FlagIcon, LockIcon } from "@/components/icons";
import { Card, Eyebrow } from "@/components/ui";
import type { MonthMission } from "@/lib/progress";

/** October → November → December as one connected journey. */
export function MissionJourney({ months }: { months: MonthMission[] }) {
  return (
    <Card className="animate-rise [animation-delay:80ms]" aria-labelledby="journey-title">
      <Eyebrow>
        <span id="journey-title">Mission journey</span>
      </Eyebrow>
      <ol className="mt-4 grid" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
        {months.map((m, i) => {
          const isCurrent = m.phase === "current";
          const done = m.progress.complete;
          const prevDone = i > 0 && months[i - 1].progress.complete;
          return (
            <li
              key={m.month}
              className="relative flex flex-col items-center text-center"
              data-testid={`journey-${m.month}`}
              aria-current={isCurrent ? "step" : undefined}
            >
              {i > 0 ? (
                <span
                  aria-hidden="true"
                  className={`absolute top-5 right-1/2 h-0.5 w-full -translate-y-1/2 ${prevDone ? "bg-good" : "bg-hairline"}`}
                />
              ) : null}
              <span
                className={`relative z-10 flex size-10 items-center justify-center rounded-full ring-4 ring-surface ${
                  done
                    ? "bg-good text-white"
                    : isCurrent
                      ? "animate-soft-pulse bg-accent text-white"
                      : "bg-surface-2 text-muted"
                }`}
              >
                {done ? (
                  <CheckIcon className="size-5" />
                ) : isCurrent ? (
                  <span className="text-sm font-bold">{i + 1}</span>
                ) : m.phase === "past" ? (
                  <FlagIcon className="size-4" />
                ) : (
                  <LockIcon className="size-4" />
                )}
              </span>
              <span
                className={`mt-2 rounded-xl px-2 py-1 ${isCurrent ? "bg-accent-soft" : ""}`}
              >
                <span className={`block text-[15px] font-semibold ${m.phase === "upcoming" ? "text-muted" : ""}`}>
                  {m.label.slice(0, 3)}
                </span>
                <span className="block text-xs text-muted">
                  {m.phase === "upcoming" ? `${m.progress.target} cases` : `${m.progress.total} / ${m.progress.target}`}
                </span>
              </span>
              <span className="sr-only">
                {m.label}: {m.progress.total} of {m.progress.target} cases,{" "}
                {done ? "complete" : isCurrent ? "current month" : m.phase === "past" ? "closed" : "upcoming"}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
