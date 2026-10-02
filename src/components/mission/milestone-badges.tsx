import { Bolt3D, type ArtProps, Medal3D, Star3D, Trophy3D } from "@/components/art/objects";
import { CheckIcon, LockIcon } from "@/components/icons";
import { type MilestoneKey, type MonthMilestone, pluralCases } from "@/lib/mission";

const OBJECT: Record<MilestoneKey, (p: ArtProps) => React.ReactNode> = {
  started: Star3D,
  halfway: Medal3D,
  momentum: Bolt3D,
  cleared: Trophy3D,
};

/**
 * The month's milestones as achievement badges (squad achievements only).
 * Unlocked: vibrant gradient tile with a full-colour 3D object and a shine.
 * Locked: soft lavender tile with the same object in the muted material,
 * still inviting rather than "disabled".
 */
export function MilestoneBadges({ milestones }: { milestones: MonthMilestone[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3" aria-label="Milestones">
      {milestones.map((m, i) => {
        const Obj = OBJECT[m.key];
        return (
          <li
            key={m.key}
            data-testid={`milestone-${m.key}`}
            className={`relative isolate overflow-hidden rounded-[24px] p-4 pt-3 ${
              m.reached
                ? "shine bg-brand text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_5px_0_-1px_var(--hero-lip),0_16px_28px_-16px_rgba(61,95,224,0.9)]"
                : "bg-surface text-foreground shadow-tile"
            }`}
          >
            {m.reached ? (
              <span aria-hidden="true" className="absolute -top-10 -right-10 -z-10 size-28 rounded-full bg-white/15 blur-xl" />
            ) : (
              <span aria-hidden="true" className="absolute -top-10 -right-10 -z-10 size-28 rounded-full bg-violet-soft blur-xl" />
            )}
            <Obj
              className={`relative -ml-1 size-[68px] ${m.reached ? "animate-unlock" : ""}`}
              muted={!m.reached}
            />
            <p className="relative mt-1 text-[15px] leading-tight font-extrabold">{m.label}</p>
            <p className={`relative mt-0.5 text-[13px] font-semibold tabular-nums ${m.reached ? "text-white/85" : "text-muted"}`}>
              {pluralCases(m.cases)}
            </p>
            <span
              className={`absolute top-3 right-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${
                m.reached ? "bg-white text-good-text" : "bg-surface-2 text-muted"
              }`}
              style={m.reached ? { animationDelay: `${i * 80}ms` } : undefined}
            >
              {m.reached ? <CheckIcon className="size-3" /> : <LockIcon className="size-3" />}
              <span>{m.reached ? "reached" : "locked"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
