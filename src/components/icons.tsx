// Small inline icon set (no icon dependency). Decorative by default.
type IconProps = { className?: string };

function Svg({ className = "size-4", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const LockIcon = (p: IconProps) => (
  <Svg {...p}><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>
);
export const FlagIcon = (p: IconProps) => <Svg {...p}><path d="M5 21V4m0 0h11l-2 4 2 4H5" /></Svg>;
export const TargetIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></Svg>
);
export const TrendIcon = (p: IconProps) => <Svg {...p}><path d="M4 16l5-5 4 4 7-7m0 0h-5m5 0v5" /></Svg>;
export const RocketIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15l-3-3c1.5-4.5 4.5-7.5 10-8-.5 5.5-3.5 8.5-8 10z" />
    <path d="M9 12H5.5l2-3.5H11M12 15v3.5l3.5-2V13" />
  </Svg>
);
export const ChevronLeftIcon = (p: IconProps) => <Svg {...p}><path d="M15 5l-7 7 7 7" /></Svg>;
export const MinusIcon = (p: IconProps) => <Svg {...p}><path d="M5 12h14" /></Svg>;
export const PlusIcon = (p: IconProps) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const AlertIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 8v5m0 3.5v.01" /><path d="M10.3 3.9L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></Svg>
);
export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" /></Svg>
);
export const EditIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16v4z" /></Svg>
);
