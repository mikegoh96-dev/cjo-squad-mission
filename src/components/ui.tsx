// Small presentational primitives shared by the screens.

export function Card({
  children,
  className = "",
  as: Tag = "section",
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" }) {
  return (
    <Tag
      className={`rounded-[28px] bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)] ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-[13px] font-semibold tracking-[0.08em] text-muted uppercase ${className}`}>{children}</p>
  );
}

/**
 * Accessible single-value meter. The unfilled track is a lighter step of the
 * fill's own hue; completed missions switch to the status green.
 */
export function Meter({
  value,
  complete = false,
  size = "lg",
  label,
  markers = [],
}: {
  value: number; // 0-100
  complete?: boolean;
  size?: "lg" | "sm";
  label: string;
  markers?: number[];
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={`relative w-full overflow-hidden rounded-full ${size === "lg" ? "h-3.5" : "h-2"} ${
        complete ? "bg-good-track" : "bg-accent-track"
      }`}
    >
      {clamped > 0 ? (
        <div
          className={`animate-meter absolute inset-y-0 left-0 rounded-full ${complete ? "bg-good" : "bg-accent"}`}
          style={{ width: `${clamped}%` }}
        />
      ) : null}
      {markers.map((m) => (
        <span
          key={m}
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-surface"
          style={{ left: `${m}%` }}
        />
      ))}
    </div>
  );
}
