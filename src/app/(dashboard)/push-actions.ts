"use server";

import { isPushEndpoint } from "@/lib/push/endpoint";
import { isPushConfigured, sendWelcome } from "@/lib/push/server";
import { createClient } from "@/lib/supabase/server";

export type PushResult = { ok: true; welcomed: boolean } | { ok: false; reason: "invalid" | "unavailable" | "off" };

/**
 * Turn notifications on for this phone: store its (anonymous) push
 * subscription, then (when turning on) send it a welcome notification to prove
 * the whole chain works. Also called quietly on page load to keep it fresh.
 */
export async function enablePush(subscription: unknown, options: { welcome?: boolean } = {}): Promise<PushResult> {
  if (!isPushConfigured()) return { ok: false, reason: "off" };
  const sub = subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!isPushEndpoint(endpoint) || typeof p256dh !== "string" || typeof auth !== "string") {
    return { ok: false, reason: "invalid" };
  }
  const { error } = await createClient().rpc("register_push_device", {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
  });
  if (error) return { ok: false, reason: error.code === "22023" || error.code === "23514" ? "invalid" : "unavailable" };
  const welcomed = options.welcome === true ? await sendWelcome({ endpoint, p256dh, auth }) : false;
  return { ok: true, welcomed };
}

/** Turn notifications off for this phone. */
export async function disablePush(endpoint: unknown): Promise<{ ok: boolean }> {
  if (!isPushEndpoint(endpoint)) return { ok: false };
  const { error } = await createClient().rpc("unregister_push_device", { p_endpoint: endpoint });
  return { ok: !error };
}
