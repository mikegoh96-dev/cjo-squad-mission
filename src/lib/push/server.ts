import "server-only";
import webpush from "web-push";
import { getDashboard } from "@/lib/data/dashboard";
import { createClient } from "@/lib/supabase/server";
import { deliver, type DeliverDeps, type PushDevice } from "./deliver";
import { type ClaimedJob, type Recipient, runJobs, type RunReport, ttlSeconds } from "./jobs";
import { casesAddedMessage, type PushMessage, welcomeMessage } from "./message";

/**
 * Push config (Vercel env). Missing values = notifications off; the app works
 * as before. VAPID keys sign messages; PUSH_SECRET lets this server list the
 * opted-in devices (push_devices) without any service-role key.
 */
function pushConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const secret = process.env.PUSH_SECRET;
  if (!publicKey || !privateKey || !secret) return null;
  // Contact URL for push services: VAPID_SUBJECT, else the production URL Vercel sets.
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const subject = process.env.VAPID_SUBJECT ?? (host ? `https://${host}` : "https://localhost");
  return { publicKey, privateKey, secret, subject };
}

export function isPushConfigured(): boolean {
  return pushConfig() !== null;
}

function deps(config: NonNullable<ReturnType<typeof pushConfig>>): DeliverDeps {
  const supabase = createClient();
  return {
    list: async () => {
      const { data, error } = await supabase.rpc("push_devices", { p_secret: config.secret });
      if (error) throw error;
      return data ?? [];
    },
    send: (device, payload) => sendTo(config, device, payload),
    forget: async (endpoints) => {
      const { error } = await supabase.rpc("forget_push_devices", { p_secret: config.secret, p_endpoints: endpoints });
      if (error) throw error;
    },
  };
}

function sendTo(
  config: NonNullable<ReturnType<typeof pushConfig>>,
  device: PushDevice,
  payload: string,
  // How long the push service keeps trying an offline phone, then drops it.
  { ttl = 60 * 60 * 6, urgency = "normal" as "normal" | "high" } = {},
) {
  return webpush.sendNotification(
    { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
    payload,
    {
      vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
      TTL: ttl,
      urgency,
      timeout: 8000,
    },
  );
}

// ---------------------------------------------------------------------------
// Notifications V2: durable outbox (see jobs.ts and the notifications_v2
// migration). Called by the scheduler (/api/notify/run) every minute and after
// each save. If the migration is not applied yet, the legacy direct send below
// is used instead, so there is never a gap.
// ---------------------------------------------------------------------------

export type RunResult =
  | { status: "ok"; report: RunReport }
  | { status: "not-configured" }
  | { status: "legacy" };

class OutboxMissing extends Error {}

/** PostgREST "function not found": the V2 functions don't exist yet. */
function isMissingFunction(error: { code?: string } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

function toRecipients(value: unknown): Recipient[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((r) =>
    r && typeof r === "object" && typeof r.id === "string" && typeof r.endpoint === "string" &&
    typeof r.p256dh === "string" && typeof r.auth === "string"
      ? [{ id: r.id, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }]
      : [],
  );
}

/** Plan, claim and deliver due notifications (bounded; safe to overlap). */
export async function runNotifications(): Promise<RunResult> {
  const config = pushConfig();
  // Without push keys nothing is claimed, so queued jobs wait instead of failing.
  if (!config) return { status: "not-configured" };
  const supabase = createClient();
  try {
    const report = await runJobs({
      plan: async () => {
        const { error } = await supabase.rpc("notify_plan", { p_secret: config.secret });
        if (isMissingFunction(error)) throw new OutboxMissing();
        if (error) throw error;
      },
      claim: async (limit) => {
        const { data, error } = await supabase.rpc("notify_claim", { p_secret: config.secret, p_limit: limit });
        if (error) throw error;
        return (data ?? []).map(
          (row): ClaimedJob => ({
            jobId: row.job_id,
            claimToken: row.claim_token,
            kind: row.kind,
            payload: row.payload,
            recipients: toRecipients(row.recipients),
          }),
        );
      },
      send: (recipient, payload, kind) =>
        sendTo(config, recipient, payload, { ttl: ttlSeconds(kind), urgency: kind === "milestone" || kind === "pc_milestone" ? "high" : "normal" }),
      complete: async (job, results) => {
        const { error } = await supabase.rpc("notify_complete", {
          p_secret: config.secret,
          p_job_id: job.jobId,
          p_claim_token: job.claimToken,
          p_results: results,
        });
        // Not fatal: the claim's lease expires and the job is retried.
        if (error) console.error("notify: complete failed", job.jobId, error.code);
      },
    });
    if (report.jobs) console.info("notify: run", report); // counts only, never endpoints
    return { status: "ok", report };
  } catch (error) {
    if (error instanceof OutboxMissing) return { status: "legacy" };
    throw error;
  }
}

/**
 * After a save added cases (runs after the response; never slows a tap).
 * V2: kick the outbox (the activity alert itself goes out once its 60-second
 * window closes, on the scheduler's next run). Before the V2 migration: the
 * legacy direct alert, now including the phone that tapped.
 */
export async function notifyAfterSave(input: { squadMemberId: string; previousCount: number; caseCount: number }) {
  try {
    const result = await runNotifications();
    if (result.status === "legacy") await notifyCasesAdded({ ...input, exceptEndpoint: null });
  } catch (error) {
    console.error("notify: after save failed", (error as { code?: string }).code ?? error);
  }
}

/**
 * After a PC$ save stored something (runs after the response). The save
 * already queued its notification in the outbox, in the same transaction;
 * this only delivers it now instead of on the scheduler's next run. Never
 * throws.
 */
export async function notifyAfterPcSave(): Promise<void> {
  try {
    await runNotifications();
  } catch (error) {
    console.error("notify: after PC$ save failed", (error as { code?: string }).code ?? error);
  }
}

/**
 * Tell every other opted-in phone that a member added cases. Runs after the
 * save has responded (never slows a tap); failures are logged, never thrown.
 */
export async function notifyCasesAdded(input: {
  squadMemberId: string;
  /** This member's total before and after the save. */
  previousCount: number;
  caseCount: number;
  exceptEndpoint: string | null;
}): Promise<void> {
  const config = pushConfig();
  const added = input.caseCount - input.previousCount;
  if (!config || added <= 0) return;
  try {
    const dashboard = await getDashboard();
    if (dashboard.state !== "ready") return;
    const { focus, contributions } = dashboard.progress;
    const member = contributions.find((c) => c.squadMemberId === input.squadMemberId);
    if (!member) return;
    // Everyone else's cases (read now) + this member's exact before value.
    const others = focus.progress.total - member.monthCases;
    const message = casesAddedMessage({
      squadMemberId: input.squadMemberId,
      name: member.displayName,
      added,
      squadTotal: focus.progress.total,
      squadBefore: others + input.previousCount,
      target: focus.progress.target,
      monthLabel: focus.label,
    });
    await deliver(message, deps(config), { exceptEndpoint: input.exceptEndpoint });
  } catch (error) {
    console.error("push: notifyCasesAdded failed", error);
  }
}

/** A phone just opted in: confirm with one notification to that phone only. */
export async function sendWelcome(device: PushDevice): Promise<boolean> {
  const config = pushConfig();
  if (!config) return false;
  const message: PushMessage = welcomeMessage();
  try {
    await sendTo(config, device, JSON.stringify(message));
    return true;
  } catch (error) {
    console.error("push: welcome failed", (error as { statusCode?: number }).statusCode ?? error);
    return false;
  }
}
