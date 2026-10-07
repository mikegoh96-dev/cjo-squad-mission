// Original 3D-style achievement objects (inline SVG, ~1–2 KB each, no images).
// All share the materials and lighting in art-defs.tsx: cast shadow, an offset
// depth layer for thickness, a lit body, rims, and a glossy highlight.
// `muted` renders the locked look: soft lavender-grey, still friendly.

type Material = "gold" | "blue" | "violet" | "rose" | "green" | "silver" | "flame" | "navy";
export type ArtProps = { className?: string; muted?: boolean; title?: string };

const fill = (m: Material, muted: boolean | undefined, part = "") => `url(#art-${muted ? "muted" : m}${part})`;

function Art({
  className = "",
  title,
  muted,
  children,
}: {
  className?: string;
  title?: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      data-art-muted={muted ? "" : undefined}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {children}
    </svg>
  );
}

function Shadow({ cx = 60, cy = 111, rx = 30 }: { cx?: number; cy?: number; rx?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={5} fill="#1b2566" opacity={0.24} filter="url(#art-shadow-blur)" />;
}

function Gloss({ cx, cy, rx, ry, opacity = 0.85 }: { cx: number; cy: number; rx: number; ry: number; opacity?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#art-gloss)" opacity={opacity} />;
}

/** Five-point star path. */
export function star(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

/** Four-point twinkle used as a tiny accent. */
function Twinkle({ x, y, s = 1, opacity = 0.9 }: { x: number; y: number; s?: number; opacity?: number }) {
  return (
    <path
      d={`M${x} ${y - 6 * s}C${x + 1 * s} ${y - 1 * s} ${x + 1 * s} ${y - 1 * s} ${x + 6 * s} ${y}C${x + 1 * s} ${y + 1 * s} ${x + 1 * s} ${y + 1 * s} ${x} ${y + 6 * s}C${x - 1 * s} ${y + 1 * s} ${x - 1 * s} ${y + 1 * s} ${x - 6 * s} ${y}C${x - 1 * s} ${y - 1 * s} ${x - 1 * s} ${y - 1 * s} ${x} ${y - 6 * s}Z`}
      fill="#fff"
      opacity={opacity}
    />
  );
}

export function Trophy3D({ className, muted, title }: ArtProps) {
  const cup = "M30 20h60v18c0 20-13.4 34-30 34S30 58 30 38z";
  return (
    <Art className={className} title={title} muted={muted}>
      <Shadow rx={32} />
      <rect x="32" y="94" width="58" height="15" rx="5" fill={fill("navy", muted, "-depth")} />
      <rect x="30" y="91" width="58" height="14" rx="5" fill={fill("navy", muted)} />
      <rect x="34" y="92.6" width="50" height="2.6" rx="1.3" fill="#fff" opacity={0.28} />
      <rect x="47" y="96" width="24" height="5" rx="2.5" fill={fill("gold", muted, "-top")} />
      <path d="M52 68h16l4 23H48z" fill={fill("gold", muted, "-depth")} />
      <path d="M53 68h12l3 22H51z" fill={fill("gold", muted)} />
      <ellipse cx="60" cy="88.5" rx="13" ry="3.6" fill={fill("gold", muted, "-depth")} />
      <path d="M33 30c-15-1-17 24 7 27" fill="none" stroke={fill("gold", muted, "-depth")} strokeWidth="8.5" strokeLinecap="round" />
      <path d="M87 30c15-1 17 24-7 27" fill="none" stroke={fill("gold", muted, "-depth")} strokeWidth="8.5" strokeLinecap="round" />
      <path d="M32.5 29c-13-1-15 21 6 24.5" fill="none" stroke={fill("gold", muted, "-top")} strokeWidth="4" strokeLinecap="round" />
      <path d="M87.5 29c13-1 15 21-6 24.5" fill="none" stroke={fill("gold", muted)} strokeWidth="4" strokeLinecap="round" />
      <path d={cup} transform="translate(2.6 2.6)" fill={fill("gold", muted, "-depth")} />
      <path d={cup} fill={fill("gold", muted)} />
      <ellipse cx="60" cy="20" rx="30" ry="6.5" fill={fill("gold", muted, "-top")} />
      <ellipse cx="60" cy="20.6" rx="24.5" ry="4" fill={fill("gold", muted, "-depth")} />
      <path d={star(61.5, 45.5, 12, 5)} fill={fill("silver", muted, "-depth")} />
      <path d={star(60, 44, 12, 5)} fill={fill("silver", muted)} />
      <path d="M37 27c1 16 6 28 15 36" fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth="4.5" strokeLinecap="round" />
      <Gloss cx={45} cy={34} rx={9} ry={14} />
      {!muted ? <Twinkle x={98} y={14} s={1.1} /> : null}
    </Art>
  );
}

export function Medal3D({ className, muted, title }: ArtProps) {
  return (
    <Art className={className} title={title} muted={muted}>
      <Shadow rx={26} />
      <path d="M41 6h15l13 40H55z" fill={fill("blue", muted)} />
      <path d="M41 6h6l13 40h-5z" fill="#fff" opacity={0.25} />
      <path d="M79 6H64L51 46h14z" fill={fill("rose", muted)} />
      <circle cx="62.5" cy="74.5" r="30" fill={fill("gold", muted, "-depth")} />
      <circle cx="60" cy="72" r="30" fill={fill("gold", muted)} />
      <circle cx="60" cy="72" r="22" fill={fill("gold", muted, "-depth")} />
      <circle cx="60" cy="72" r="19.5" fill={fill("gold", muted, "-top")} />
      <path d={star(61.4, 73.4, 12, 5)} fill={fill("gold", muted, "-depth")} />
      <path d={star(60, 72, 12, 5)} fill={fill("silver", muted)} />
      <Gloss cx={48} cy={59} rx={12} ry={9} />
      {!muted ? <Twinkle x={92} y={52} s={0.9} /> : null}
    </Art>
  );
}

export function Crown3D({ className, muted, title }: ArtProps) {
  const body = "M24 84L19 36l23 21 18-31 18 31 23-21-5 48z";
  return (
    <Art className={className} title={title} muted={muted}>
      <Shadow cy={109} rx={36} />
      <path d={body} transform="translate(2.6 2.6)" fill={fill("gold", muted, "-depth")} />
      <path d={body} fill={fill("gold", muted)} />
      <path d="M27 80l-4-36 9 8" fill="none" stroke="#fff" strokeOpacity={0.5} strokeWidth="3.5" strokeLinecap="round" />
      <rect x="24.6" y="78.6" width="76" height="20" rx="6" fill={fill("gold", muted, "-depth")} />
      <rect x="22" y="76" width="76" height="20" rx="6" fill={fill("gold", muted, "-top")} />
      <rect x="22" y="87" width="76" height="9" rx="4.5" fill={fill("gold", muted)} opacity={0.6} />
      {[
        [40, 86, 5, "rose"],
        [60, 86, 6.5, "blue"],
        [80, 86, 5, "green"],
      ].map(([x, y, r, m]) => (
        <g key={String(x)}>
          <circle cx={Number(x)} cy={Number(y)} r={Number(r)} fill={fill(m as Material, muted)} />
          <circle cx={Number(x) - Number(r) * 0.35} cy={Number(y) - Number(r) * 0.4} r={Number(r) * 0.35} fill="#fff" opacity={0.75} />
        </g>
      ))}
      {[
        [19, 36, 6],
        [60, 25, 7],
        [101, 36, 6],
      ].map(([x, y, r]) => (
        <g key={`t${x}`}>
          <circle cx={x + 1.5} cy={y + 1.5} r={r} fill={fill("gold", muted, "-depth")} />
          <circle cx={x} cy={y} r={r} fill={fill("gold", muted, "-top")} />
          <circle cx={x - r * 0.35} cy={y - r * 0.35} r={r * 0.35} fill="#fff" opacity={0.85} />
        </g>
      ))}
      <Gloss cx={44} cy={58} rx={12} ry={10} opacity={0.6} />
      {!muted ? <Twinkle x={104} y={66} s={0.9} /> : null}
    </Art>
  );
}

export function Rocket3D({ className, muted, title }: ArtProps) {
  const bodyPath = "M60 10C80 26 82 62 76 90H44C38 62 40 26 60 10z";
  return (
    <Art className={className} title={title} muted={muted}>
      <Shadow cy={112} rx={26} />
      <g transform="rotate(38 60 62)">
        <path d="M49 90q11 30 22 0z" fill={fill("flame", muted)} />
        <path d="M54 90q6 16 12 0z" fill={fill("gold", muted, "-top")} />
        <path d="M44 66l-16 22 18-3z" fill={fill("rose", muted, "-depth")} />
        <path d="M76 66l16 22-18-3z" fill={fill("rose", muted)} />
        <path d={bodyPath} transform="translate(2.4 1.6)" fill={fill("silver", muted, "-depth")} />
        <path d={bodyPath} fill={fill("silver", muted)} />
        <path d="M60 10C69 17 74 27 77 38H43C46 27 51 17 60 10z" fill={fill("rose", muted)} />
        <circle cx="60" cy="54" r="11.5" fill={fill("navy", muted)} />
        <circle cx="60" cy="54" r="8" fill={fill("blue", muted)} />
        <circle cx="56.6" cy="50.6" r="3" fill="#fff" opacity={0.85} />
        <rect x="43" y="86" width="34" height="6" rx="3" fill={fill("silver", muted, "-depth")} />
        <path d="M49 30c-4 16-4 36-1 54" fill="none" stroke="#fff" strokeOpacity={0.8} strokeWidth="4" strokeLinecap="round" />
      </g>
      {!muted ? (
        <>
          <Twinkle x={18} y={26} s={0.9} />
          <Twinkle x={100} y={92} s={0.7} opacity={0.7} />
        </>
      ) : null}
    </Art>
  );
}

export function Star3D({ className, muted, title }: ArtProps) {
  return (
    <Art className={className} title={title} muted={muted}>
      <Shadow rx={28} />
      <path d={star(63, 61, 44, 20)} fill={fill("gold", muted, "-depth")} />
      <path d={STAR_PATH} fill={fill("gold", muted)} />
      <path d={star(60, 58, 30, 13.5)} fill={fill("gold", muted, "-top")} opacity={0.85} />
      <g clipPath="url(#art-clip-star)">
        <Gloss cx={50} cy={44} rx={14} ry={11} />
      </g>
      {!muted ? <Twinkle x={98} y={20} s={1} /> : null}
    </Art>
  );
}

export const BOLT_PATH = "M70 8L30 66h27l-9 46 42-64H63z";
export const FLAME_PATH =
  "M60 8C66 30 90 40 90 70C90 93 76 108 60 108S30 94 30 72C30 56 41 48 45 35C49 45 53 50 58 52C56 38 56 23 60 8Z";
export const STAR_PATH = star(60, 58, 44, 20);

export function Bolt3D({ className, muted, title }: ArtProps) {
  const bolt = BOLT_PATH;
  return (
    <Art className={className} title={title} muted={muted}>
      <Shadow rx={24} />
      <path d={bolt} transform="translate(3 3)" fill={fill("violet", muted, "-depth")} />
      <path d={bolt} fill={fill("violet", muted)} />
      <g clipPath="url(#art-clip-bolt)">
        <path d="M66 16L38 60" fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth="4" strokeLinecap="round" />
        <Gloss cx={52} cy={38} rx={10} ry={14} opacity={0.7} />
      </g>
      {!muted ? <Twinkle x={96} y={86} s={0.8} /> : null}
    </Art>
  );
}

export function Flame3D({ className, muted, title }: ArtProps) {
  const outer = FLAME_PATH;
  return (
    <Art className={className} title={title} muted={muted}>
      <Shadow cy={113} rx={24} />
      <path d={outer} transform="translate(2.6 2.4)" fill={fill("flame", muted, "-depth")} />
      <path d={outer} fill={fill("flame", muted)} />
      <path
        d="M60 54C64 66 75 72 75 86C75 98 68 104 60 104S45 98 45 88C45 78 53 74 55 66C57 72 59 72 60 54Z"
        fill={fill("gold", muted, "-top")}
      />
      <g clipPath="url(#art-clip-flame)">
        <Gloss cx={47} cy={60} rx={8} ry={16} opacity={0.7} />
      </g>
    </Art>
  );
}

export function Gem3D({ className, muted, title }: ArtProps) {
  return (
    <Art className={className} title={title} muted={muted}>
      <Shadow rx={26} />
      <path d="M33 47L47 29h32l14 18-30 56z" transform="translate(2.5 2.5)" fill={fill("blue", muted, "-depth")} />
      <path d="M30 44l14-18h32l14 18-30 56z" fill={fill("blue", muted)} />
      <path d="M30 44l14-18h32l14 18z" fill={fill("blue", muted, "-top")} />
      <path d="M44 26l16 18 16-18z" fill="#fff" opacity={0.35} />
      <path d="M30 44h30v56z" fill="#fff" opacity={0.18} />
      <path d="M60 44h30L60 100z" fill={fill("blue", muted, "-depth")} opacity={0.45} />
      <Gloss cx={47} cy={36} rx={10} ry={6} />
      {!muted ? <Twinkle x={92} y={22} s={0.9} /> : null}
    </Art>
  );
}

/** Notifications: a glossy gold bell with its clapper. */
export function Bell3D({ className, muted, title }: ArtProps) {
  const body = "M60 22c-4 0-7 3-7 7v2.6C40 35 32 47 32 62v16l-8 10v4h72v-4l-8-10V62c0-15-8-27-21-30.4V29c0-4-3-7-7-7z";
  return (
    <Art className={className} title={title} muted={muted}>
      <Shadow rx={30} />
      <circle cx={62.5} cy={103.5} r={8} fill={fill("gold", muted, "-depth")} />
      <circle cx={60} cy={101} r={8} fill={fill("gold", muted)} />
      <path d={body} transform="translate(2.5 2.5)" fill={fill("gold", muted, "-depth")} />
      <path d={body} fill={fill("gold", muted)} />
      <rect x={24} y={86} width={72} height={8} rx={4} fill={fill("gold", muted, "-top")} />
      <circle cx={60} cy={23} r={5} fill={fill("gold", muted, "-top")} />
      <path d="M41 62c0-9 4-17 12-21" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" opacity={0.45} />
      <Gloss cx={48} cy={52} rx={8} ry={12} />
      {!muted ? <Twinkle x={97} y={28} s={0.9} /> : null}
    </Art>
  );
}
