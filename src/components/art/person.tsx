import type { AvatarKind } from "@/lib/avatars";

/**
 * Member avatar art: a friendly bust drawn inside the round avatar orb.
 * The shirt uses `currentColor`, so each member keeps their own tint; skin and
 * hair are shared. Same lighting as the 3D objects: key light top-left, a
 * slightly darker neck for depth, and a soft gloss on the head.
 */
const SKIN = "#F6CDAE";
const SKIN_SHADE = "#E2A882";
// Hair follows the theme (see --avatar-hair in globals.css); eyes stay dark.
const HAIR = "var(--avatar-hair)";
const HAIR_LIGHT = "var(--avatar-hair-sheen)";
const EYES = "#2E2240";

export function PersonArt({ kind }: { kind: AvatarKind }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className="size-full">
      {kind === "woman" ? (
        // Long hair falls behind the head and shoulders.
        <path d="M10.6 19C10.2 9.6 14.6 6.4 20 6.4s9.8 3.2 9.4 12.6l1 11.6c-3.4 1.8-17.4 1.8-20.8 0z" fill={HAIR} />
      ) : null}
      {/* Shoulders */}
      <path d="M5.5 41c0-8.6 6.3-13 14.5-13s14.5 4.4 14.5 13z" fill="currentColor" />
      <path d="M14.6 28.9c1.5 1.9 3.3 2.8 5.4 2.8s3.9-.9 5.4-2.8" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.4" strokeLinecap="round" />
      {/* Neck */}
      <rect x="16.8" y="21.5" width="6.4" height="8" rx="2.6" fill={SKIN_SHADE} />
      {/* Ears and head */}
      <ellipse cx="12.6" cy="18" rx="1.6" ry="2.1" fill={SKIN_SHADE} />
      <ellipse cx="27.4" cy="18" rx="1.6" ry="2.1" fill={SKIN_SHADE} />
      <ellipse cx="20" cy="17.2" rx="7.4" ry="8.4" fill={SKIN} />
      {kind === "woman" ? (
        // Side-swept fringe.
        <path d="M12.5 17c-.2-6.4 3.3-9.3 7.7-9.3 4.6 0 7.6 2.9 7.3 9.1-1.6-3.1-4.6-4.9-8.3-4.6-2.9.3-5.1 1.9-6.7 4.8z" fill={HAIR} />
      ) : (
        // Short crop with a little volume on top.
        <path d="M12.4 16.6c-.6-6.4 3-9.6 7.9-9.6 5.2 0 8.1 3.3 7.4 9.4-.8-2.7-2.6-4.2-5.4-4.3-3.6-.2-6.9.6-9.9 4.5z" fill={HAIR} />
      )}
      {/* Hair sheen and face gloss */}
      <path d="M15.2 10.6c1.4-1.2 3.1-1.8 5-1.8" fill="none" stroke={HAIR_LIGHT} strokeWidth="1.3" strokeLinecap="round" />
      <ellipse cx="17" cy="15.6" rx="3" ry="2.2" fill="#fff" opacity="0.28" />
      {/* Friendly face */}
      <circle cx="17.3" cy="18.6" r="0.95" fill={EYES} />
      <circle cx="22.7" cy="18.6" r="0.95" fill={EYES} />
      <path d="M17.6 21.9c1.5 1.2 3.3 1.2 4.8 0" fill="none" stroke="#B5674A" strokeWidth="1.1" strokeLinecap="round" />
      <ellipse cx="15.4" cy="21" rx="1.3" ry="0.8" fill="#FF8FA3" opacity="0.35" />
      <ellipse cx="24.6" cy="21" rx="1.3" ry="0.8" fill="#FF8FA3" opacity="0.35" />
    </svg>
  );
}
