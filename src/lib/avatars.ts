// Which avatar art each squad member gets (identity only, never a comparison).
// Matched on display name, case-insensitive. The names live in
// src/config/squad.ts; anyone not listed there keeps their initials.

import { type AvatarKind, squadConfig } from "../config/squad.ts";

export type { AvatarKind };

const BY_NAME = new Map<string, AvatarKind>(
  Object.entries(squadConfig.avatars).map(([name, kind]) => [name.trim().toLowerCase(), kind]),
);

export function avatarKindFor(name: string): AvatarKind | null {
  return BY_NAME.get(name.trim().toLowerCase()) ?? null;
}
