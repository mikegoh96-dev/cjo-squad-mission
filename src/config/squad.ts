// Everything that makes this deployment one particular squad's app: names,
// wording and avatars. Squad data (members, campaign, monthly targets, time
// zone) lives in the database, not here (see `npm run setup`).
//
// Setting up your own squad? Edit the values below, then run `npm test`: it
// checks this file (and that public/sw.js uses the same app name).

export type AvatarKind = "man" | "woman";

export const squadConfig = {
  /** Shown at the top of every screen, on the splash, in the browser tab and in the recap video. */
  appName: "CJO Squad Mission",
  /** Under the Home Screen icon (keep it short: about 12 characters). */
  shortName: "CJO Squad",
  tagline: "One team. One target.",
  description: "One team. One target. Our squad's collective mission progress.",
  /** Title used when a recap summary or video is shared. */
  recapTitle: "CJO Squad Recap",
  /** Start of downloaded recap file names, e.g. "CJO-Squad-Recap-October-2026.mp4". Letters, digits and dashes. */
  fileSlug: "CJO-Squad-Recap",
  /**
   * Notification wording. Must match the policy row in the database
   * (private.notify_policy: quiet_start / quiet_end, recap_dow / recap_time,
   * time_zone); this only describes it to the squad.
   */
  notifications: {
    quietHours: "10pm–8am",
    quietEnd: "8am",
    timeZoneLabel: "Singapore time",
    recap: "Mondays 9am",
  },
  /**
   * Avatar art per member, matched on display name (case and spaces ignored).
   * Members not listed get their initials instead. Keys: lowercase names.
   */
  avatars: {
    claire: "woman",
    cynthia: "woman",
    jamie: "woman",
    jasmine: "woman",
    jy: "man",
    mike: "man",
  } satisfies Record<string, AvatarKind> as Record<string, AvatarKind>,
} as const;
