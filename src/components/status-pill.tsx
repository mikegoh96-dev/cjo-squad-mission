import { type MissionStatus, STATUS_LABEL } from "@/lib/mission";
import { CheckIcon, FlagIcon, LockIcon, RocketIcon, TargetIcon, TrendIcon } from "./icons";

// Status is always icon + label, never colour alone.
const STYLE: Record<MissionStatus, { className: string; Icon: (p: { className?: string }) => React.ReactNode }> = {
  complete: { className: "bg-good-soft text-good-text", Icon: CheckIcon },
  "almost-there": { className: "bg-accent-soft text-accent-strong", Icon: TargetIcon },
  "on-track": { className: "bg-accent-soft text-accent-strong", Icon: TrendIcon },
  "behind-pace": { className: "bg-surface-2 text-foreground", Icon: RocketIcon },
  "not-started": { className: "bg-surface-2 text-foreground", Icon: RocketIcon },
  upcoming: { className: "bg-surface-2 text-muted", Icon: LockIcon },
  closed: { className: "bg-surface-2 text-muted", Icon: FlagIcon },
};

export function StatusPill({ status, onBrand = false }: { status: MissionStatus; onBrand?: boolean }) {
  const { Icon } = STYLE[status];
  const className = onBrand ? "bg-white/20 text-white" : STYLE[status].className;
  return (
    <span
      data-testid="mission-status"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold ${className}`}
    >
      <Icon className="size-3.5" />
      {STATUS_LABEL[status]}
    </span>
  );
}
