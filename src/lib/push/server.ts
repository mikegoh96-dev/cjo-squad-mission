import "server-only";
import webpush from "web-push";
import { getDashboard } from "@/lib/data/dashboard";
import { createClient } from "@/lib/supabase/server";
import { deliver, type DeliverDeps, type PushDevice } from "./deliver";
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

function sendTo(config: NonNullable<ReturnType<typeof pushConfig>>, device: PushDevice, payload: string) {
  return webpush.sendNotification(
    { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
    payload,
    {
      vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
      TTL: 60 * 60 * 6, // deliver within 6 h if the phone is offline, else drop
      urgency: "normal",
      timeout: 8000,
    },
  );
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
