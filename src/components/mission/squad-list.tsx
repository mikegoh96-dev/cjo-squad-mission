import { UsersIcon } from "@/components/icons";
import { Avatar, Card, Eyebrow } from "@/components/ui";
import { pluralCases } from "@/lib/mission";
import type { Contribution } from "@/lib/progress";

/** Everyone's contribution to the shared total, listed A–Z (never ranked). */
export function SquadList({
  contributions,
  monthLabel,
  total,
}: {
  contributions: Contribution[];
  monthLabel: string;
  total: number;
}) {
  return (
    <Card className="animate-rise [animation-delay:180ms]" aria-labelledby="squad-title">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>
          <span id="squad-title">Our squad</span>
        </Eyebrow>
        <p className="text-[13px] text-muted">{monthLabel} · A–Z</p>
      </div>
      {contributions.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-surface-2 p-4 text-[15px] text-muted">
          <UsersIcon className="size-5" />
          No members yet. Your squad lead will add everyone soon.
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-hairline" data-testid="squad-list">
          {contributions.map((c) => (
            <li key={c.squadMemberId} className="flex items-center gap-3 py-3">
              <Avatar name={c.displayName} id={c.squadMemberId} initials={c.initials} />
              <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{c.displayName}</span>
              <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-[14px] font-bold tabular-nums">
                {pluralCases(c.monthCases)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center justify-between rounded-2xl bg-accent-soft px-4 py-3" data-testid="squad-total">
        <span className="text-[15px] font-semibold text-accent-strong">Squad total</span>
        <span className="text-[17px] font-extrabold text-accent-strong tabular-nums">{pluralCases(total)}</span>
      </div>
    </Card>
  );
}
