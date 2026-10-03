"use client";

import { Gem3D } from "@/components/art/objects";
import { UsersIcon } from "@/components/icons";
import { Eyebrow } from "@/components/ui";
import { pluralCases } from "@/lib/mission";
import { useLiveBoard } from "./live-board";
import { MemberCard } from "./member-card";

export type BoardMember = { id: string; name: string; initials: string; count: number };

/** Everyone's big card for this month, A–Z (never ranked), with the live squad total. */
export function SquadBoard({
  members,
  monthLabel,
  closedNote,
}: {
  members: BoardMember[];
  monthLabel: string;
  closedNote: string | null;
}) {
  const { total, editable } = useLiveBoard();
  return (
    <section id="squad" aria-labelledby="squad-title" className="animate-rise scroll-mt-4 [animation-delay:60ms]">
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <Eyebrow>
            <span id="squad-title">Our squad · {monthLabel}</span>
          </Eyebrow>
          <p className="mt-0.5 text-[14px] text-muted">
            {editable ? "Closed a case? Tap + on your card." : closedNote}
          </p>
        </div>
        <span className="shrink-0 text-[13px] text-muted">A–Z</span>
      </div>
      {members.length === 0 ? (
        <div className="mt-3 flex items-center gap-3 rounded-tile bg-surface p-4 text-[15px] text-muted shadow-card">
          <UsersIcon className="size-5" />
          No members yet. Your squad lead will add everyone soon.
        </div>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3" data-testid="squad-board">
          {members.map((m) => (
            <MemberCard key={m.id} id={m.id} name={m.name} initials={m.initials} serverCount={m.count} />
          ))}
        </ul>
      )}
      <div
        className="mt-4 flex items-center justify-between rounded-tile bg-accent-soft px-4 py-3 shadow-tile"
        data-testid="squad-total"
      >
        <span className="flex items-center gap-2 text-[15px] font-bold text-accent-strong">
          <Gem3D className="size-9" />
          Squad total
        </span>
        <span className="text-[19px] font-extrabold text-accent-strong tabular-nums">{pluralCases(total)}</span>
      </div>
    </section>
  );
}
