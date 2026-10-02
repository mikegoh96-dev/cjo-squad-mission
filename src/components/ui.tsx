// Small presentational primitives shared by the screens.
import { initialsFor } from "@/lib/initials";

export function Card({
  children,
  className = "",
  as: Tag = "section",
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" }) {
  return (
    <Tag className={`rounded-[28px] bg-surface p-5 shadow-card ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-[12px] font-bold tracking-[0.12em] text-muted uppercase ${className}`}>{children}</p>
  );
}

/**
 * Accessible single-value meter. The unfilled track is a lighter step of the
 * fill's own hue; completed missions switch to the status green. `onBrand`
 * renders white-on-gradient for the hero card.
 */
export function Meter({
  value,
  complete = false,
  size = "lg",
  label,
  markers = [],
  onBrand = false,
}: {
  value: number; // 0-100
  complete?: boolean;
  size?: "lg" | "sm";
  label: string;
  markers?: number[];
  onBrand?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const track = onBrand ? "bg-white/25" : complete ? "bg-good-track" : "bg-accent-track";
  const fill = onBrand ? "bg-white" : complete ? "bg-good" : "bg-accent";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={`relative w-full overflow-hidden rounded-full ${size === "lg" ? "h-3.5" : "h-2"} ${track}`}
    >
      {clamped > 0 ? (
        <div className={`animate-meter absolute inset-y-0 left-0 rounded-full ${fill}`} style={{ width: `${clamped}%` }} />
      ) : null}
      {markers.map((m) => (
        <span
          key={m}
          aria-hidden="true"
          className={`absolute inset-y-0 w-0.5 -translate-x-1/2 ${onBrand ? "bg-brand-from/70" : "bg-surface"}`}
          style={{ left: `${m}%` }}
        />
      ))}
    </div>
  );
}

/** Circular progress (decorative; pair it with visible numbers). */
export function Ring({
  value,
  size = 56,
  stroke = 6,
  tone = "accent",
  children,
}: {
  value: number; // 0-100
  size?: number;
  stroke?: number;
  tone?: "accent" | "good" | "muted";
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const colors = {
    accent: ["var(--accent-track)", "var(--accent)"],
    good: ["var(--good-track)", "var(--good)"],
    muted: ["var(--hairline)", "var(--muted)"],
  }[tone];
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors[0]} strokeWidth={stroke} />
        {clamped > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={colors[1]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - clamped / 100)}
          />
        ) : null}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  );
}

// Soft avatar tints. Identity only (the name is always shown next to it).
const AVATAR_TINTS = [
  "bg-[#e3eaff] text-[#2d4fc4] dark:bg-[#1f2a55] dark:text-[#a3b8ff]",
  "bg-[#ece5ff] text-[#5a3bc4] dark:bg-[#2a2150] dark:text-[#c4b2ff]",
  "bg-[#ffe6ee] text-[#b23a5f] dark:bg-[#3d1a28] dark:text-[#ffa3bf]",
  "bg-[#e2f6ec] text-[#1d7a4a] dark:bg-[#12351f] dark:text-[#7fe0a8]",
  "bg-[#fff0de] text-[#a3560c] dark:bg-[#3a2410] dark:text-[#ffbe7a]",
  "bg-[#e0f3f8] text-[#1f6f86] dark:bg-[#102f38] dark:text-[#86d4ea]",
];

function tintFor(key: string) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

export function Avatar({
  name,
  id,
  initials,
  size = "md",
}: {
  name: string;
  id: string;
  /** Squad-unique initials (from progress); falls back to the name's own. */
  initials?: string;
  size?: "sm" | "md" | "lg";
}) {
  const dims = { sm: "size-8 text-[11px]", md: "size-11 text-sm", lg: "size-14 text-base" }[size];
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${dims} ${tintFor(id)}`}
    >
      {initials ?? initialsFor(name)}
    </span>
  );
}
