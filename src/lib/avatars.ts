// Which avatar art each squad member gets (identity only, never a comparison).
// Matched on display name, case-insensitive. Anyone not listed keeps their
// initials until added here.

export type AvatarKind = "man" | "woman";

const BY_NAME: Record<string, AvatarKind> = {
  claire: "woman",
  cynthia: "woman",
  jamie: "woman",
  jasmine: "woman",
  jy: "man",
  mike: "man",
};

export function avatarKindFor(name: string): AvatarKind | null {
  return BY_NAME[name.trim().toLowerCase()] ?? null;
}
