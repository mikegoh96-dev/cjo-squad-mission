"use client";

import { FlameIcon } from "@/components/icons";
import { Card, Eyebrow } from "@/components/ui";
import { useLiveBoard } from "@/components/squad/live-board";
import { formatDelta, momentumHeadline } from "@/lib/mission";

/** Team momentum: net cases added today and this week (whole squad). */
export function MomentumCard({ today: serverToday, thisWeek: serverWeek }: { today: number; thisWeek: number }) {
  // Server momentum plus this screen's taps not yet reflected in it.
  const { delta } = useLiveBoard();
  const today = serverToday + delta;
  const thisWeek = serverWeek + delta;
  return (
    <Card className="animate-rise [animation-delay:60ms]" aria-labelledby="momentum-title">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-flame-soft text-flame">
          <FlameIcon className="size-6" />
        </span>
        <div className="min-w-0">
          <Eyebrow>
            <span id="momentum-title">Team momentum</span>
          </Eyebrow>
          <p className="mt-0.5 text-[17px] leading-snug font-bold" data-testid="momentum-headline">
            {momentumHeadline(today, thisWeek)}
          </p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface-2 px-4 py-3">
          <dt className="text-[13px] font-medium text-muted">Today</dt>
          <dd className="mt-0.5 text-[26px] leading-tight font-extrabold tabular-nums" data-testid="momentum-today">
            {formatDelta(today)}
          </dd>
        </div>
        <div className="rounded-2xl bg-surface-2 px-4 py-3">
          <dt className="text-[13px] font-medium text-muted">This week</dt>
          <dd className="mt-0.5 text-[26px] leading-tight font-extrabold tabular-nums" data-testid="momentum-week">
            {formatDelta(thisWeek)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
