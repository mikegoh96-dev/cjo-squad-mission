import { CheckIcon, FlagIcon, LockIcon, RocketIcon, TrophyIcon, TrendIcon } from "@/components/icons";
import { type MilestoneKey, type MonthMilestone, pluralCases } from "@/lib/mission";

const ICON: Record<MilestoneKey, typeof RocketIcon> = {
  started: RocketIcon,
  halfway: FlagIcon,
  momentum: TrendIcon,
  cleared: TrophyIcon,
};

/** The month's milestones as collectible-looking tiles (squad achievements only). */
export function MilestoneBadges({ milestones }: { milestones: MonthMilestone[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3" aria-label="Milestones">
      {milestones.map((m) => {
        const Icon = ICON[m.key];
        return (
          <li
            key={m.key}
            data-testid={`milestone-${m.key}`}
            className={`relative overflow-hidden rounded-[22px] p-4 ${
              m.reached ? "bg-brand text-white shadow-[0_12px_28px_-14px_rgba(61,95,224,0.8)]" : "bg-surface-2 text-muted"
            }`}
          >
            <span
              className={`flex size-11 items-center justify-center rounded-2xl ${m.reached ? "bg-white/20" : "bg-surface"}`}
            >
              <Icon className="size-6" />
            </span>
            <p className={`mt-3 text-[15px] leading-tight font-bold ${m.reached ? "" : "text-foreground"}`}>{m.label}</p>
            <p className="mt-0.5 text-[13px] font-medium tabular-nums">{pluralCases(m.cases)}</p>
            <span
              className={`absolute top-3 right-3 flex size-6 items-center justify-center rounded-full ${
                m.reached ? "bg-white text-good-text" : "bg-surface text-muted"
              }`}
            >
              {m.reached ? <CheckIcon className="size-3.5" /> : <LockIcon className="size-3" />}
              <span className="sr-only">{m.reached ? "reached" : "locked"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
