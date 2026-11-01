// Notifications V2 (pure, unit-tested): wording for each outbox job, how a
// push-service error is classified, and the plan -> claim -> send -> complete
// loop. The database decides what is sent, when and to whom
// (supabase/migrations/*_notifications_v2.sql); this file only renders and
// delivers. Collective framing: contributors are named A-Z, never with their
// own totals, never ranked.
import { monthMilestones, missionProgress, type MilestoneKey, pluralCases } from "../mission.ts";
import { pcDollars } from "../pc.ts";
import { monthLabel } from "../progress.ts";
import { isPushEndpoint } from "./endpoint.ts";
import type { PushMessage } from "./message.ts";

export type JobKind = "activity" | "milestone" | "rally" | "reminder" | "recap" | "pc_activity" | "pc_milestone";

export type ClaimedJob = {
  jobId: number;
  claimToken: string;
  kind: string;
  payload: unknown;
  recipients: Recipient[];
};

export type Recipient = { id: string; endpoint: string; p256dh: string; auth: string };

export type Outcome = "accepted" | "gone" | "retry" | "rejected";
export type DeliveryResult = { id: string; outcome: Outcome; code: number | null };

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------

const MILESTONE_EMOJI: Record<MilestoneKey, string> = { started: "⭐", halfway: "🏅", momentum: "⚡", cleared: "🏆" };

/** "Ben", "Ben and Daniel", "Aisha, Ben and Daniel", "A, B, C and 2 more". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= 4) return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

function squadLine(total: number, target: number, month: string): string {
  const remaining = Math.max(0, target - total);
  return remaining > 0
    ? `Squad: ${total} / ${target} for ${month} · ${pluralCases(remaining)} to go`
    : `Squad: ${total} / ${target} for ${month} · target hit! 🎯`;
}

function contributorsLine(names: string[]): string {
  return names.length ? `New cases from ${joinNames(names)}.` : "New cases just came in.";
}

function milestoneLabel(key: MilestoneKey, month: string): string {
  // Same labels as the in-app milestones (src/lib/mission.ts).
  const found = monthMilestones(missionProgress(0, 4), month).find((m) => m.key === key);
  return found?.label ?? (key === "cleared" ? `${month} cleared` : "Milestone");
}

// Defensive readers: payloads come from the database as JSON.
type Payload = Record<string, unknown>;
const obj = (v: unknown): Payload => {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Payload;
  throw new TypeError("payload must be an object");
};
const int = (p: Payload, k: string): number => {
  const v = p[k];
  if (typeof v !== "number" || !Number.isInteger(v)) throw new TypeError(`payload.${k} must be an integer`);
  return v;
};
const month = (p: Payload, k = "month"): string => {
  const v = p[k];
  if (typeof v !== "string" || !/^\d{4}-\d{2}-01$/.test(v)) throw new TypeError(`payload.${k} must be a month`);
  return monthLabel(v);
};
const names = (p: Payload): string[] => {
  const v = p.names ?? [];
  if (!Array.isArray(v) || v.some((n) => typeof n !== "string")) throw new TypeError("payload.names must be strings");
  return v as string[];
};
const isKey = (v: unknown): v is MilestoneKey =>
  v === "started" || v === "halfway" || v === "momentum" || v === "cleared";

// PC$ challenge (pc_activity / pc_milestone): whose cumulative amount changed
// and to what (never who typed it: there is no login), the squad total from
// the database, and any milestone the save crossed.
type PcUpdate = { name: string; old: number | null; next: number };
const MAX_LISTED = 5;

function pcUpdates(p: Payload): PcUpdate[] {
  const v = p.updates;
  if (!Array.isArray(v) || v.length === 0) throw new TypeError("payload.updates must be a non-empty list");
  return v.map((x) => {
    const u = obj(x);
    if (typeof u.name !== "string" || !u.name.trim()) throw new TypeError("update.name must be text");
    const old = u.old === null || u.old === undefined ? null : int(u, "old");
    return { name: u.name.trim(), old, next: int(u, "new") };
  });
}

const isCorrection = (u: PcUpdate) => u.old !== null && u.next < u.old;
/** A–Z like the member cards (case-insensitive), whatever order the database used. */
const byName = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" }) || a.localeCompare(b, "en");

/** "Ben's November production is now $8,000." / "...was corrected to $7,500." / a list for several. */
function pcUpdatesLine(updates: PcUpdate[], month: string): string {
  if (updates.length === 1) {
    const [u] = updates;
    return isCorrection(u)
      ? `${u.name}'s ${month} production was corrected to ${pcDollars(u.next)}.`
      : `${u.name}'s ${month} production is now ${pcDollars(u.next)}.`;
  }
  const allCorrections = updates.every(isCorrection);
  const items = updates
    .slice(0, MAX_LISTED)
    .map((u) => `${u.name} ${pcDollars(u.next)}${isCorrection(u) && !allCorrections ? " (corrected)" : ""}`);
  const more = updates.length > MAX_LISTED ? ` and ${updates.length - MAX_LISTED} more` : "";
  return `${month} production${allCorrections ? " corrected" : ""}: ${items.join(", ")}${more}.`;
}

function renderPc(kind: "pc_activity" | "pc_milestone", p: Payload): PushMessage {
  const m = month(p);
  const total = int(p, "total");
  const target = int(p, "target");
  const minimum = int(p, "minimum");
  const updates = pcUpdates(p).sort((a, b) => byName(a.name, b.name));
  const reached = names({ names: p.minimum_reached ?? [] }).sort(byName);
  const progress = `Squad progress: ${pcDollars(total)} / ${pcDollars(target)}.`;
  const line = pcUpdatesLine(updates, m);

  if (kind === "pc_milestone" && p.target_reached === true) {
    const parts = [`Your squad has reached ${pcDollars(target)}! Squad total: ${pcDollars(total)}.`];
    if (reached.length) parts.push(`${joinNames(reached)} ${reached.length === 1 ? "has" : "have"} reached the ${pcDollars(minimum)} minimum.`);
    parts.push(
      p.everyone_minimum === true
        ? `Every member is at the ${pcDollars(minimum)} minimum too.`
        : `Next: every member needs at least ${pcDollars(minimum)}.`,
    );
    parts.push(line);
    return { title: "🏆 SQUAD PC$ TARGET ACHIEVED!", body: parts.join(" "), tag: "pc-target", url: "/mission" };
  }
  if (kind === "pc_milestone" && reached.length) {
    return {
      title: "✅ MINIMUM PC$ ACHIEVED!",
      body: `${joinNames(reached)} ${reached.length === 1 ? "has" : "have"} reached the individual ${pcDollars(minimum)} requirement! ${line} ${progress}`,
      tag: `pc-minimum-${reached.join("-").toLowerCase().replace(/[^a-z0-9-]/g, "")}`.slice(0, 60),
      url: "/mission",
    };
  }
  const corrections = updates.every(isCorrection);
  return {
    title: corrections ? "✏️ PC$ CORRECTION" : "💰 PC$ UPDATE!",
    body: `${line} ${progress}`,
    tag: "pc-update",
    url: "/",
  };
}

/** The notification for one outbox job. Throws on a malformed payload. */
export function renderJob(kind: string, payload: unknown): PushMessage {
  const p = obj(payload);
  switch (kind) {
    case "activity": {
      const m = month(p);
      return {
        title: "🚀 The squad is moving!",
        body: `${contributorsLine(names(p))} ${squadLine(int(p, "total"), int(p, "target"), m)}`,
        tag: "squad-activity",
        url: "/",
      };
    }
    case "milestone": {
      if (!isKey(p.key)) throw new TypeError("payload.key must be a milestone");
      const m = month(p);
      return {
        title: `${MILESTONE_EMOJI[p.key]} ${milestoneLabel(p.key, m)}!`,
        body: `${contributorsLine(names(p))} ${squadLine(int(p, "total"), int(p, "target"), m)}`,
        tag: `milestone-${p.key}`,
        url: "/mission",
      };
    }
    case "rally": {
      const m = month(p);
      const total = int(p, "total");
      const target = int(p, "target");
      const remaining = target - total;
      return {
        title: "🔥 So close!",
        body:
          remaining > 0
            ? `The squad is ${pluralCases(remaining)} away from clearing ${m}. One squad, one mission!`
            : `${squadLine(total, target, m)}. One squad, one mission!`,
        tag: "rally",
        url: "/mission",
      };
    }
    case "reminder": {
      const m = month(p);
      const name = typeof p.name === "string" && p.name.trim() ? `${p.name.trim()}, please` : "Please";
      return {
        title: "Quick squad check-in",
        body: `${name} confirm your ${m} case count (even if it's zero) so the mission board stays accurate.`,
        tag: "checkin",
        url: "/?checkin=1",
      };
    }
    case "recap": {
      const net = int(p, "net");
      const m = month(p);
      const total = int(p, "total");
      const target = int(p, "target");
      const crossed = Array.isArray(p.milestones) ? p.milestones : [];
      const labels = crossed.flatMap((x) => {
        const item = obj(x);
        return isKey(item.key) ? [milestoneLabel(item.key, month(item))] : [];
      });
      const parts: string[] = [];
      if (net > 0) parts.push(`+${pluralCases(net)} last week.`);
      if (labels.length) parts.push(`${labels.length === 1 ? "Milestone" : "Milestones"}: ${labels.join(", ")}.`);
      const remaining = target - total;
      parts.push(
        remaining > 0
          ? `${m}: ${total} / ${target} · ${pluralCases(remaining)} to go. Keep it rolling!`
          : `${m}: ${total} / ${target} · cleared! 🎯 Amazing teamwork.`,
      );
      return { title: "📊 Your squad's week", body: parts.join(" "), tag: "recap", url: "/mission" };
    }
    case "pc_activity":
    case "pc_milestone":
      return renderPc(kind, p);
    default:
      throw new TypeError(`unknown job kind ${kind}`);
  }
}

/** How long a push service should keep trying to reach an offline phone. */
export function ttlSeconds(kind: string): number {
  return kind === "activity" || kind === "pc_activity" ? 2 * 3600 : kind === "rally" ? 6 * 3600 : 12 * 3600;
}

// ---------------------------------------------------------------------------
// Push-service errors
// ---------------------------------------------------------------------------

/**
 * 404/410: the phone unsubscribed (remove it). 429/5xx or no response
 * (network, timeout): try again later. Other 4xx: our payload or keys are
 * wrong; retrying would not help and the phone is kept.
 */
export function classifyPushError(error: unknown): { outcome: Exclude<Outcome, "accepted">; code: number | null } {
  const code = (error as { statusCode?: unknown } | null)?.statusCode;
  if (typeof code !== "number") return { outcome: "retry", code: null };
  if (code === 404 || code === 410) return { outcome: "gone", code };
  if (code === 429 || code >= 500) return { outcome: "retry", code };
  return { outcome: "rejected", code };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export type RunDeps = {
  plan: () => Promise<unknown>;
  claim: (limit: number) => Promise<ClaimedJob[]>;
  /** Resolves when the push service accepted; rejects with { statusCode }. */
  send: (recipient: Recipient, payload: string, kind: string) => Promise<unknown>;
  complete: (job: ClaimedJob, results: DeliveryResult[]) => Promise<unknown>;
  now?: () => number;
};

export type RunReport = {
  jobs: number;
  accepted: number;
  retry: number;
  gone: number;
  rejected: number;
  byKind: Record<string, number>;
};

/**
 * Plan, then claim and deliver due jobs in bounded batches until none are left
 * or the time budget is spent. Safe to run concurrently: claims are atomic in
 * the database, and a late report from an expired claim is ignored there.
 */
export async function runJobs(
  deps: RunDeps,
  options: { batch?: number; budgetMs?: number } = {},
): Promise<RunReport> {
  const batch = options.batch ?? 10;
  const budgetMs = options.budgetMs ?? 20_000;
  const now = deps.now ?? Date.now;
  const started = now();
  const report: RunReport = { jobs: 0, accepted: 0, retry: 0, gone: 0, rejected: 0, byKind: {} };

  await deps.plan();
  while (now() - started < budgetMs) {
    const jobs = await deps.claim(batch);
    for (const job of jobs) {
      const results = await deliverJob(job, deps);
      await deps.complete(job, results);
      report.jobs += 1;
      report.byKind[job.kind] = (report.byKind[job.kind] ?? 0) + 1;
      for (const r of results) report[r.outcome] += 1;
    }
    if (jobs.length < batch) break;
  }
  return report;
}

async function deliverJob(job: ClaimedJob, deps: RunDeps): Promise<DeliveryResult[]> {
  let payload: string;
  try {
    payload = JSON.stringify(renderJob(job.kind, job.payload));
  } catch {
    // A malformed job is never retried and never removes a phone.
    return job.recipients.map((r) => ({ id: r.id, outcome: "rejected", code: null }));
  }
  return Promise.all(
    job.recipients.map(async (r): Promise<DeliveryResult> => {
      if (!isPushEndpoint(r.endpoint)) return { id: r.id, outcome: "rejected", code: null };
      try {
        await deps.send(r, payload, job.kind);
        return { id: r.id, outcome: "accepted", code: 201 };
      } catch (error) {
        return { id: r.id, ...classifyPushError(error) };
      }
    }),
  );
}
