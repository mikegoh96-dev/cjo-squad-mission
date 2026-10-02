import { Card, Eyebrow } from "@/components/ui";
import { pluralCases } from "@/lib/mission";
import type { Contribution } from "@/lib/progress";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/**
 * Who has contributed this month. Alphabetical and neutral on purpose:
 * visibility and accountability, never a ranking.
 */
export function SquadList({
  monthLabel,
  contributions,
  squadTotal,
}: {
  monthLabel: string;
  contributions: Contribution[];
  squadTotal: number;
}) {
  return (
    <Card className="animate-rise [animation-delay:240ms]" aria-labelledby="squad-title">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>
          <span id="squad-title">Our squad</span>
        </Eyebrow>
        <p className="text-[13px] text-muted">{monthLabel} contributions</p>
      </div>
      {contributions.length === 0 ? (
        <p className="mt-4 text-[15px] text-muted">No squad members have been added yet.</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-hairline" data-testid="squad-list">
            {contributions.map((c) => (
              <li key={c.squadMemberId} className="flex items-center gap-3 py-3">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold text-muted"
                >
                  {initials(c.displayName)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[16px] font-medium">{c.displayName}</span>
                <span className="text-[16px] font-semibold">{pluralCases(c.monthCases)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3">
            <span className="text-[15px] font-semibold">Squad total</span>
            <span className="text-[15px] font-semibold" data-testid="squad-total">
              {pluralCases(squadTotal)}
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
