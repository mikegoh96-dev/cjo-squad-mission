// Push notification wording (pure, unit-tested). Collective framing: the
// squad's progress is the headline; the person who added cases is credited,
// never compared with anyone.
import { crossedMilestone, pluralCases } from "../mission.ts";

export type PushMessage = {
  title: string;
  body: string;
  /** Same tag replaces an older notification on the lock screen. */
  tag: string;
  url: string;
};

const MILESTONE_EMOJI = { started: "⭐", halfway: "🏅", momentum: "⚡", cleared: "🏆" } as const;

/** Someone added cases: "🎉 Ben added 2 cases" / a milestone headline. */
export function casesAddedMessage(input: {
  squadMemberId: string;
  name: string;
  added: number;
  /** The squad total now (shown in the body). */
  squadTotal: number;
  /**
   * The squad total just before this save, when known exactly. Saves landing in
   * the same moment both see the later total, so `squadTotal - added` alone can
   * miss (or repeat) a milestone. Defaults to `squadTotal - added`.
   */
  squadBefore?: number;
  target: number;
  monthLabel: string;
}): PushMessage {
  const { squadMemberId, name, added, squadTotal, target, monthLabel } = input;
  const before = Math.max(0, input.squadBefore ?? squadTotal - added);
  const what = added === 1 ? "a case" : pluralCases(added);
  const remaining = Math.max(0, target - squadTotal);
  const squadLine =
    remaining > 0
      ? `Squad: ${squadTotal} / ${target} for ${monthLabel} · ${pluralCases(remaining)} to go`
      : `Squad: ${squadTotal} / ${target} for ${monthLabel} · target hit! 🎯`;

  const milestone = crossedMilestone(before, before + added, target, monthLabel);
  if (milestone) {
    return {
      title: `${MILESTONE_EMOJI[milestone.key]} ${milestone.label}!`,
      body: `${name} added ${what}. ${squadLine}`,
      tag: `milestone-${milestone.key}`,
      url: "/",
    };
  }
  return { title: `🎉 ${name} added ${what}`, body: squadLine, tag: `member-${squadMemberId}`, url: "/" };
}

/** Sent once to a phone that just turned notifications on. */
export function welcomeMessage(): PushMessage {
  return {
    title: "🔔 Notifications are on",
    body: "You'll hear it here whenever the squad adds cases. Let's go!",
    tag: "welcome",
    url: "/",
  };
}
