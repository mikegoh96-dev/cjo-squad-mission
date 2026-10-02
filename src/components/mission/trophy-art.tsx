/** Decorative mission emblem for the hero card (original artwork, inline SVG). */
export function TrophyArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="cup" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset="1" stopColor="#f5a524" />
        </linearGradient>
        <linearGradient id="cupShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b3f73" />
          <stop offset="1" stopColor="#23264d" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="56" r="50" fill="#fff" opacity="0.12" />
      <circle cx="60" cy="56" r="36" fill="#fff" opacity="0.12" />
      <path d="M34 34c-12 0-14 20 6 24M86 34c12 0 14 20-6 24" fill="none" stroke="#f5a524" strokeWidth="6" strokeLinecap="round" />
      <path d="M36 26h48v18c0 15-10.7 26-24 26S36 59 36 44z" fill="url(#cup)" />
      <path d="M36 26h48v18c0 15-10.7 26-24 26S36 59 36 44z" fill="url(#cupShade)" />
      <path d="M60 33l3.6 7.3 8 1.2-5.8 5.6 1.4 8L60 51.3l-7.2 3.8 1.4-8-5.8-5.6 8-1.2z" fill="#fff" opacity="0.95" />
      <rect x="54" y="69" width="12" height="12" rx="2" fill="#f5a524" />
      <rect x="42" y="80" width="36" height="14" rx="5" fill="url(#base)" />
      <rect x="49" y="85" width="22" height="4" rx="2" fill="#f5c84b" opacity="0.9" />
      <circle cx="98" cy="22" r="3" fill="#fff" opacity="0.8" />
      <circle cx="20" cy="76" r="2.5" fill="#fff" opacity="0.7" />
      <path d="M100 66l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill="#fff" opacity="0.85" />
    </svg>
  );
}
