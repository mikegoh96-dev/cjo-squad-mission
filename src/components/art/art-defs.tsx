import { BOLT_PATH, FLAME_PATH, STAR_PATH } from "./objects";

/**
 * Shared materials for the 3D achievement objects (rendered once in the root
 * layout). Every object references these, so the whole set shares one lighting
 * model: key light from the top-left, a glossy specular highlight, a darker
 * "depth" layer offset down-right for thickness, and a soft cast shadow.
 *
 * Material ramps (light -> base -> shade -> deep):
 *   gold, blue, violet, rose, green, silver, flame, navy
 *   muted = locked state: soft lavender-grey, still pleasant (not "disabled")
 */
const MATERIALS: Record<string, [string, string, string, string]> = {
  gold: ["#FFF3B0", "#FFD84D", "#F5A524", "#B9620A"],
  blue: ["#B9CEFF", "#7392FF", "#3D5FE0", "#22358F"],
  violet: ["#E0D4FF", "#A487FF", "#6A4AE0", "#3E2794"],
  rose: ["#FFD0DC", "#FF7FA0", "#E8456F", "#9E1D43"],
  green: ["#CFF7DA", "#62DD8C", "#16A34A", "#0A6630"],
  silver: ["#FFFFFF", "#EDF1FA", "#C3CBE3", "#8590B3"],
  flame: ["#FFF0B8", "#FFB547", "#F97316", "#B8400C"],
  navy: ["#5B6BC2", "#3A4AA0", "#28347A", "#18204F"],
  muted: ["#FAFBFF", "#E6E9F7", "#C9CFEA", "#9EA6CB"],
};

export function ArtDefs() {
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
      <defs>
        {Object.entries(MATERIALS).map(([name, [light, base, shade, deep]]) => (
          <g key={name}>
            {/* Body: lit from the top-left */}
            <linearGradient id={`art-${name}`} x1="0.15" y1="0" x2="0.85" y2="1">
              <stop offset="0" stopColor={light} />
              <stop offset="0.38" stopColor={base} />
              <stop offset="0.78" stopColor={shade} />
              <stop offset="1" stopColor={deep} />
            </linearGradient>
            {/* Depth / extrusion side */}
            <linearGradient id={`art-${name}-depth`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={shade} />
              <stop offset="1" stopColor={deep} />
            </linearGradient>
            {/* Top faces / rims */}
            <linearGradient id={`art-${name}-top`} x1="0" y1="0" x2="1" y2="0.6">
              <stop offset="0" stopColor={light} />
              <stop offset="1" stopColor={base} />
            </linearGradient>
          </g>
        ))}
        {/* Specular highlight */}
        <radialGradient id="art-gloss" cx="0.32" cy="0.25" r="0.6">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        {/* Soft cast shadow */}
        <filter id="art-shadow-blur" x="-50%" y="-200%" width="200%" height="500%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        {/* Keep highlights inside their shapes */}
        <clipPath id="art-clip-star">
          <path d={STAR_PATH} />
        </clipPath>
        <clipPath id="art-clip-bolt">
          <path d={BOLT_PATH} />
        </clipPath>
        <clipPath id="art-clip-flame">
          <path d={FLAME_PATH} />
        </clipPath>
        {/* Member avatars (person.tsx): soft 3D skin, glossy hair, deep eyes */}
        <radialGradient id="art-av-skin" cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#FFE9D9" />
          <stop offset="0.55" stopColor="#F9CCAE" />
          <stop offset="1" stopColor="#E7A07E" />
        </radialGradient>
        <linearGradient id="art-av-neck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#D98F6E" />
          <stop offset="1" stopColor="#F2B999" />
        </linearGradient>
        <linearGradient id="art-av-hair-woman" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#B87A4E" />
          <stop offset="0.45" stopColor="#8A5134" />
          <stop offset="1" stopColor="#5A3020" />
        </linearGradient>
        <linearGradient id="art-av-hair-man" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#7E5640" />
          <stop offset="0.5" stopColor="#4F3426" />
          <stop offset="1" stopColor="#2F1F17" />
        </linearGradient>
        <radialGradient id="art-av-iris" cx="0.5" cy="0.62" r="0.6">
          <stop offset="0" stopColor="#B08465" />
          <stop offset="0.6" stopColor="#6B4632" />
          <stop offset="1" stopColor="#3A251B" />
        </radialGradient>
        <linearGradient id="art-av-shirt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.38" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.12" />
        </linearGradient>
        {/* Ambient glow behind hero objects */}
        <radialGradient id="art-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}
