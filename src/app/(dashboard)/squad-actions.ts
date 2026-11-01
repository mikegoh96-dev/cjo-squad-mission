"use server";

import type { DevicePrefs } from "@/lib/notify-client";
import { isPushEndpoint } from "@/lib/push/endpoint";
import { createClient } from "@/lib/supabase/server";

// This phone's notification preferences (Notifications V2): the write. The
// read is in src/lib/notify-client.ts. Degrades to "unavailable" until the
// notifications_v2 migration is applied, and the UI then hides the toggles.

type Failure = { ok: false; reason: "invalid" | "unavailable" };
const invalid: Failure = { ok: false, reason: "invalid" };
const unavailable: Failure = { ok: false, reason: "unavailable" };

const isBool = (v: unknown): v is boolean => typeof v === "boolean";

export async function saveDevicePrefs(endpoint: unknown, prefs: unknown): Promise<{ ok: true } | Failure> {
  const p = prefs as Partial<DevicePrefs> | null;
  if (!isPushEndpoint(endpoint) || !p || !isBool(p.activity) || !isBool(p.milestones) || !isBool(p.reminders) || !isBool(p.recap)) {
    return invalid;
  }
  const { error } = await createClient().rpc("set_push_device_prefs", {
    p_endpoint: endpoint,
    p_activity: p.activity,
    p_milestones: p.milestones,
    p_reminders: p.reminders,
    p_recap: p.recap,
  });
  if (error) return error.code === "P0002" ? invalid : unavailable;
  return { ok: true };
}
