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

/** Someone added cases: "🎉 Cynthia added 2 cases" / a milestone headline. */
export function casesAddedMessage(input: {
  squadMemberId: string;
  name: string;
  added: number;
  squadTotal: number;
  target: number;
  monthLabel: string;
}): PushMessage {
  const { squadMemberId, name, added, squadTotal, target, monthLabel } = input;
  const what = added === 1 ? "a case" : pluralCases(added);
  const remaining = Math.max(0, target - squadTotal);
  const squadLine =
    remaining > 0
      ? `Squad: ${squadTotal} / ${target} for ${monthLabel} · ${pluralCases(remaining)} to go`
      : `Squad: ${squadTotal} / ${target} for ${monthLabel} · target hit! 🎯`;

  const milestone = crossedMilestone(Math.max(0, squadTotal - added), squadTotal, target, monthLabel);
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
