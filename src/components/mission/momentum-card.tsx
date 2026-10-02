"use client";

import { Flame3D } from "@/components/art/objects";
import { Avatar, Card, Eyebrow } from "@/components/ui";
import { useLiveBoard } from "@/components/squad/live-board";
import { liveMemberWeek } from "@/lib/board";
import { formatDelta, momentumHeadline } from "@/lib/mission";

type Person = { id: string; name: string; initials: string };

/**
 * Team momentum: net cases added today and this week, plus each person's
 * contribution this week (A–Z, never ranked).
 */
export function MomentumCard({
  today: serverToday,
  thisWeek: serverWeek,
  memberWeek,
  people,
}: {
  today: number;
  thisWeek: number;
  memberWeek: Record<string, number> | null;
  people: Person[];
}) {
  // Server momentum plus this screen's taps not yet reflected in it.
  const { delta, counts, serverCounts } = useLiveBoard();
  const today = serverToday + delta;
  const thisWeek = serverWeek + delta;
  const perPerson = memberWeek ? liveMemberWeek(memberWeek, serverCounts, counts) : null;
  return (
    <Card className="animate-rise [animation-delay:60ms]" aria-labelledby="momentum-title">
      <div className="flex items-center gap-3">
        <span className="relative flex size-14 shrink-0 items-center justify-center rounded-[18px] bg-flame-soft shadow-tile">
          <Flame3D className="size-12" />
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
        <div className="rounded-2xl bg-surface-2 px-4 py-3 shadow-[inset_0_1px_0_var(--card-highlight)]">
          <dt className="text-[13px] font-medium text-muted">Today</dt>
          <dd className="mt-0.5 text-[26px] leading-tight font-extrabold tabular-nums" data-testid="momentum-today">
            {formatDelta(today)}
          </dd>
        </div>
        <div className="rounded-2xl bg-surface-2 px-4 py-3 shadow-[inset_0_1px_0_var(--card-highlight)]">
          <dt className="text-[13px] font-medium text-muted">This week</dt>
          <dd className="mt-0.5 text-[26px] leading-tight font-extrabold tabular-nums" data-testid="momentum-week">
            {formatDelta(thisWeek)}
          </dd>
        </div>
      </dl>

      {perPerson && people.length > 0 ? (
        <div className="mt-4">
          <p className="text-[13px] font-semibold text-muted">Everyone&apos;s contribution this week · A–Z</p>
          <ul className="mt-2 grid grid-cols-2 gap-2" data-testid="member-week">
            {people.map((p) => {
              const n = perPerson[p.id] ?? 0;
              return (
                <li
                  key={p.id}
                  data-member={p.name}
                  className="flex min-w-0 items-center gap-2 rounded-2xl bg-surface-2 px-2.5 py-2"
                >
                  <Avatar name={p.name} id={p.id} initials={p.initials} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{p.name}</span>
                  <span
                    className={`shrink-0 text-[15px] font-extrabold tabular-nums ${n > 0 ? "text-accent-strong" : "text-muted"}`}
                    data-testid="member-week-value"
                  >
                    {formatDelta(n)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
