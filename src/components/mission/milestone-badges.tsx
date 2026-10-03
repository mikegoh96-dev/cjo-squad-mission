import { Bolt3D, type ArtProps, Medal3D, Star3D, Trophy3D } from "@/components/art/objects";
import { CheckIcon, LockIcon } from "@/components/icons";
import { Decor } from "@/components/ui";
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
            className={`relative isolate rounded-tile p-4 pt-3 ${
              m.reached
                ? "bg-brand text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_5px_0_-1px_var(--hero-lip),0_16px_28px_-16px_rgba(61,95,224,0.9)]"
                : "bg-surface text-foreground shadow-tile"
            }`}
          >
            <Decor>
              <span
                className={`absolute -top-12 -right-12 size-36 rounded-full ${
                  m.reached
                    ? "bg-[radial-gradient(circle,rgba(255,255,255,0.28),transparent_70%)]"
                    : "bg-[radial-gradient(circle,var(--violet-soft),transparent_70%)]"
                }`}
              />
              {m.reached ? <span className="shine-sweep" /> : null}
            </Decor>
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
