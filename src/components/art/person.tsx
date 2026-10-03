import type { AvatarKind } from "@/lib/avatars";

/**
 * Member avatar art (original): a stylised 3D-cartoon bust inside the round
 * avatar orb. Soft volumetric skin, glossy side-swept hair with a highlight
 * streak, big eyes with two catchlights, rosy cheeks. The top uses
 * `currentColor`, so each member keeps their own tint. Materials live in
 * art-defs.tsx (`art-av-*`) and share the key light (top-left) of the 3D set.
 */
const LINE = "#2A1A12";
const BROW = { woman: "#6B3F28", man: "#3A261C" };

/** One eye: white, iris, pupil and two catchlights (centre x, y). */
function Eye({ x, y, lashes, flick }: { x: number; y: number; lashes: boolean; flick: 1 | -1 }) {
  return (
    <g>
      <ellipse cx={x} cy={y} rx="2.3" ry={lashes ? 2.5 : 2.3} fill="#fff" />
      <circle cx={x} cy={y + 0.4} r="1.75" fill="url(#art-av-iris)" />
      <circle cx={x} cy={y + 0.5} r="0.8" fill="#1E130E" />
      <circle cx={x - 0.6} cy={y - 0.4} r="0.62" fill="#fff" />
      <circle cx={x + 0.7} cy={y + 1.2} r="0.3" fill="#fff" opacity="0.85" />
      {/* Upper lid line; lashes add weight and a small flick at the outer corner */}
      <path
        d={`M${x - 2.5} ${y - 0.4}C${x - 1.8} ${y - 2.6} ${x + 1.8} ${y - 2.6} ${x + 2.5} ${y - 0.4}`}
        fill="none"
        stroke={LINE}
        strokeWidth={lashes ? 1 : 0.7}
        strokeLinecap="round"
      />
      {lashes ? (
        <path
          d={`M${x + flick * 2.5} ${y - 0.4}l${flick * 0.9} -0.6`}
          stroke={LINE}
          strokeWidth="0.8"
          strokeLinecap="round"
        />
      ) : null}
    </g>
  );
}

export function PersonArt({ kind }: { kind: AvatarKind }) {
  const woman = kind === "woman";
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-full">
      {/* Framed a little closer so the face reads at small sizes */}
      <g transform="translate(24 24) scale(1.14) translate(-24 -21.5)">
      {woman ? (
        // Shoulder-length hair behind the face, flaring at the ends.
        <>
          <path
            d="M11 23C10 11 16 6 24 6s14 5 13 17c0 5 1.5 9 3 12-5 3-27 3-32 0 1.5-3 3-7 3-12z"
            fill="url(#art-av-hair-woman)"
          />
        </>
      ) : null}

      {/* Top in the member's tint, with a soft sheen and a collar */}
      <path d="M6 49c0-9.5 7.5-14.5 18-14.5S42 39.5 42 49z" fill="currentColor" />
      <path d="M6 49c0-9.5 7.5-14.5 18-14.5S42 39.5 42 49z" fill="url(#art-av-shirt)" />
      {woman ? (
        <path d="M18.5 35.2 24 42l5.5-6.8" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.4" strokeLinejoin="round" />
      ) : (
        <path d="M19 35l3 4.5 2-3 2 3 3-4.5" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.4" strokeLinejoin="round" />
      )}

      {/* Neck (shaded under the chin) */}
      <path
        d={woman ? "M20.2 27h7.6v6.4c0 2.2-1.7 3.6-3.8 3.6s-3.8-1.4-3.8-3.6z" : "M19.8 27h8.4v6.4c0 2.3-1.9 3.8-4.2 3.8s-4.2-1.5-4.2-3.8z"}
        fill="url(#art-av-neck)"
      />

      {/* Ears, then the face */}
      <ellipse cx="13.6" cy="21.5" rx="1.9" ry="2.4" fill="url(#art-av-skin)" />
      <ellipse cx="34.4" cy="21.5" rx="1.9" ry="2.4" fill="url(#art-av-skin)" />
      {woman ? (
        <>
          <circle cx="13.7" cy="24.4" r="0.9" fill="#FFD84D" />
          <circle cx="34.3" cy="24.4" r="0.9" fill="#FFD84D" />
        </>
      ) : null}
      <path
        d={
          woman
            ? "M14 20c0-7 4.4-10.5 10-10.5S34 13 34 20c0 6.6-4.2 11-10 11s-10-4.4-10-11z"
            : "M14 19.6c0-6.8 4.4-10.2 10-10.2s10 3.4 10 10.2c0 6.4-3.6 11.2-10 11.2s-10-4.8-10-11.2z"
        }
        fill="url(#art-av-skin)"
      />
      <ellipse cx="20" cy="14.6" rx="3.6" ry="2" fill="#fff" opacity="0.2" />

      {/* Front hair */}
      {woman ? (
        <path
          d="M13.6 21c-.6-8 3.8-12.8 10.8-12.8 6.6 0 10.6 4.2 10 11.8-1-3.6-2.8-5.8-5.4-6.8-2.6 3.2-8.4 5.8-15.4 7.8z"
          fill="url(#art-av-hair-woman)"
        />
      ) : (
        <>
          <path
            d="M13.8 20.5C12.8 12 17 7.2 24 7.2s11 4.4 10.2 13.3c-.6-2.1-1.2-3.9-2.2-5.1-2.2-.8-4.4-2-5.6-3.6-1.8 1.8-6 3.2-10.4 3.6-1 1.4-1.7 3.2-2.2 5.1z"
            fill="url(#art-av-hair-man)"
          />
        </>
      )}
      {/* Glossy highlight streak */}
      <path
        d={woman ? "M16.4 12.8c1.4-2 3.8-3.2 6.6-3.4" : "M17.2 11.6c1.4-1.8 3.6-2.8 6.2-3"}
        fill="none"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={woman ? 0.35 : 0.25}
      />

      {/* Brows, eyes, nose, smile, cheeks */}
      <path
        d={woman ? "M17.6 17.2c1-.8 2.6-.9 3.6-.3M26.8 16.9c1-.6 2.6-.5 3.6.3" : "M17.4 17c1.2-.7 2.8-.8 4-.3M26.6 16.7c1.2-.5 2.8-.4 4 .3"}
        fill="none"
        stroke={BROW[kind]}
        strokeWidth={woman ? 0.9 : 1.3}
        strokeLinecap="round"
      />
      <Eye x={19.4} y={20.6} lashes={woman} flick={-1} />
      <Eye x={28.6} y={20.6} lashes={woman} flick={1} />
      <path d="M23.3 24.2c.5.5 1.3.5 1.7 0" fill="none" stroke="#D08A6A" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M21.4 26.6c1.5 1.4 3.7 1.4 5.2 0" fill="none" stroke="#C25A4A" strokeWidth="1" strokeLinecap="round" />
      <ellipse cx="17.4" cy="25" rx="1.9" ry="1.1" fill="#FF7F8F" opacity={woman ? 0.4 : 0.25} />
      <ellipse cx="30.6" cy="25" rx="1.9" ry="1.1" fill="#FF7F8F" opacity={woman ? 0.4 : 0.25} />
      </g>
    </svg>
  );
}
