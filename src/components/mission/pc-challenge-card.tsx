import { Gem3D, Trophy3D } from "@/components/art/objects";
import { CheckIcon, LockIcon } from "@/components/icons";
import { Avatar, Card, Eyebrow, Meter } from "@/components/ui";
import {
  type PcChallenge,
  type PcPhase,
  type PcStanding,
  pcClosingLabel,
  pcDollars,
  pcMonthLabel,
  pcPeriodLabel,
  qualificationLabel,
} from "@/lib/pc";

/**
 * The squad's PC$ challenge on the Mission page: squad total against the
 * official target, the individual minimum, and every member A–Z with their
 * cumulative amount and qualification (never sorted by amount). Amounts are
 * entered on the member cards on the Squad page.
 */
export function PcChallengeCard({
  challenge,
  phase,
  standing,
  initials,
  timeZone,
}: {
  challenge: PcChallenge;
  phase: PcPhase;
  standing: PcStanding;
  initials: Record<string, string>;
  timeZone: string;
}) {
  const month = pcMonthLabel(challenge);
  const { progress, allQualified, complete } = standing;
  return (
    <Card className="animate-rise relative [animation-delay:100ms]" aria-labelledby="pc-title" data-testid="pc-challenge">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>
            <span id="pc-title">{month} PC$ challenge</span>
          </Eyebrow>
          <p className="mt-0.5 text-[13px] text-muted">Production {pcPeriodLabel(challenge.eligibleFrom, challenge.eligibleTo)}</p>
        </div>
        {complete ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-good-soft px-3 py-1.5 text-[13px] font-semibold text-good-text">
            <CheckIcon className="size-3.5" />
            Challenge complete
          </span>
        ) : phase === "closed" ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-muted">
            <LockIcon className="size-3.5" />
            Entries closed
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-3">
        {complete ? <Trophy3D className="size-12 shrink-0" /> : <Gem3D className="size-12 shrink-0" />}
        <p className="min-w-0 leading-tight">
          <span className="block text-[28px] font-extrabold tracking-tight tabular-nums" data-testid="pc-total">
            {pcDollars(progress.total)}
          </span>
          <span className="text-[14px] font-semibold text-muted tabular-nums">
            of {pcDollars(progress.target)} squad target
          </span>
        </p>
      </div>
      <div className="mt-3">
        <Meter
          size="sm"
          value={progress.meterPercent}
          complete={complete}
          label={`${month} PC$: ${pcDollars(progress.total)} of ${pcDollars(progress.target)}`}
        />
      </div>
      <p className="mt-2 flex items-baseline justify-between gap-2 text-[14px]">
        <span className="font-bold tabular-nums" data-testid="pc-percent">
          {progress.percent}%
        </span>
        <span className="text-muted tabular-nums" data-testid="pc-remaining">
          {progress.complete ? "Squad target reached" : `${pcDollars(progress.remaining)} to go`}
        </span>
      </p>

      <div className="mt-4 rounded-tile bg-background p-3" data-testid="pc-minimum">
        <p className="text-[13px] font-semibold">
          Everyone needs at least {pcDollars(challenge.minimum)}
          {allQualified ? (
            <span className="ml-1 inline-flex items-center gap-1 text-good-text">
              <CheckIcon className="size-3.5" />
              Everyone&apos;s there
            </span>
          ) : null}
        </p>
        <ul className="mt-2 flex flex-col gap-2" data-testid="pc-members">
          {standing.members.map((m) => (
            <li key={m.id} className="flex items-center gap-2.5" data-testid="pc-member" data-member={m.name}>
              <Avatar name={m.name} id={m.id} initials={initials[m.id]} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold">{m.name}</span>
                <span
                  className={`flex items-center gap-1 text-[12px] font-semibold ${m.qualification.met ? "text-good-text" : "text-muted"}`}
                >
                  {m.qualification.met ? <CheckIcon className="size-3.5 shrink-0" /> : null}
                  {qualificationLabel(m.qualification)}
                </span>
              </span>
              <span className="shrink-0 text-[15px] font-extrabold tabular-nums">
                {m.amount === null ? <span className="font-semibold text-muted">–</span> : pcDollars(m.amount)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-3 text-[12px] leading-snug text-muted">
        {phase === "open"
          ? `Cumulative ${month} amounts, entered on each member's card on the Squad page. Entries close ${pcClosingLabel(challenge.closesAt, timeZone)}.`
          : `Final cumulative ${month} amounts.`}
      </p>
    </Card>
  );
}
