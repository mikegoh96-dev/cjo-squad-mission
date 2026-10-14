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
export const HomeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19z" /></Svg>
);
export const FlameIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.4 2.6-5.4 3.6-8.4.4 1.8 1.4 2.9 2.6 3.6.2-2.6 1.3-4.9 3.4-6.6-.3 3.3 3.4 5.8 3.4 11.1 0 3.6-2.6 6.4-6.5 6.4z" /><path d="M12 21c-1.6 0-2.8-1.2-2.8-2.8 0-1.8 1.6-2.6 2.2-4.2 1 1 3.4 2.2 3.4 4.4 0 1.5-1.2 2.6-2.8 2.6z" /></Svg>
);
export const TrophyIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.6 4.2M16 6h3.5a3 3 0 0 1-3.6 4.2M12 13v4m-3.5 3h7m-5.5-3h4" /></Svg>
);
export const UsersIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M15.5 5.6a3 3 0 0 1 0 5.8m2 3.7c1.5.6 2.6 2 3 4.4" /></Svg>
);
export const SparkleIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9zM18.5 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></Svg>
);
export const ClockIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>
);
export const SwapIcon = (p: IconProps) => (
  <Svg {...p}><path d="M7 7h12m0 0l-3.5-3.5M19 7l-3.5 3.5M17 17H5m0 0l3.5-3.5M5 17l3.5 3.5" /></Svg>
);
export const ChevronRightIcon = (p: IconProps) => <Svg {...p}><path d="M9 5l7 7-7 7" /></Svg>;
export const XIcon = (p: IconProps) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const GearIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Svg>
);
export const BellIcon = (p: IconProps) => (
  <Svg {...p}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0" /></Svg>
);
/** iOS-style share: a box with an arrow up. */
export const ShareIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 15V3m0 0L8 7m4-4l4 4M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16" /></Svg>
);
