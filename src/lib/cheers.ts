// The preset in-app cheers (same keys as the squad_cheers check constraint).
export const CHEER_KEYS = ["lets_go", "momentum", "got_this", "one_squad"] as const;
export type CheerKey = (typeof CHEER_KEYS)[number];
export const isCheerKey = (v: unknown): v is CheerKey => CHEER_KEYS.includes(v as CheerKey);
