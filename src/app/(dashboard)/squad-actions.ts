"use server";

import { isCheerKey } from "@/lib/cheers";
import { isUuid } from "@/lib/ids";
import type { DevicePrefs } from "@/lib/notify-client";
import { isPushEndpoint } from "@/lib/push/endpoint";
import { createClient } from "@/lib/supabase/server";

// Check-in, phone settings and cheers (Notifications V2): the writes. Reads
// are in src/lib/notify-client.ts. Every function
// degrades to "unavailable" until the notifications_v2 migration is applied,
// and the UI then simply hides these features.

type Failure = { ok: false; reason: "invalid" | "unavailable" };
const invalid: Failure = { ok: false, reason: "invalid" };
const unavailable: Failure = { ok: false, reason: "unavailable" };

const isBool = (v: unknown): v is boolean => typeof v === "boolean";

/** Route this phone's private reminders to a member (null = unlink). Not identity. */
export async function linkDevice(endpoint: unknown, memberId: unknown): Promise<{ ok: true } | Failure> {
  if (!isPushEndpoint(endpoint) || (memberId !== null && !isUuid(memberId))) return invalid;
  const { error } = await createClient().rpc("set_push_device_member", {
    p_endpoint: endpoint,
    // The generated type says string; SQL accepts null to unlink.
    p_squad_member_id: (memberId === null ? null : memberId.toLowerCase()) as string,
  });
  if (error) return error.code === "42704" || error.code === "P0002" ? invalid : unavailable;
  return { ok: true };
}

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

export type ConfirmResult =
  | { ok: true; status: "confirmed"; count: number; confirmedAt: string; month: string }
  | { ok: true; status: "conflict"; count: number }
  | Failure;

/** Confirm the member's count as shown (zero allowed). Must match the stored total. */
export async function confirmCheckin(memberId: unknown, count: unknown): Promise<ConfirmResult> {
  if (!isUuid(memberId) || !Number.isInteger(count) || (count as number) < 0 || (count as number) > 1000) return invalid;
  const { data, error } = await createClient().rpc("confirm_checkin", {
    p_squad_member_id: memberId.toLowerCase(),
    p_case_count: count as number,
  });
  if (error) return error.code === "42704" || error.code === "23514" ? invalid : unavailable;
  const row = data?.[0];
  if (!row) return unavailable;
  if (row.status === "conflict") return { ok: true, status: "conflict", count: row.case_count };
  return { ok: true, status: "confirmed", count: row.case_count, confirmedAt: row.confirmed_at, month: row.month };
}

/** Send an anonymous cheer (rate-limited in the database). */
export async function sendCheer(
  cheer: unknown,
  clientId: unknown,
): Promise<{ ok: true; status: "sent"; id: number } | { ok: true; status: "too_fast" | "busy" } | Failure> {
  if (!isCheerKey(cheer) || typeof clientId !== "string" || clientId.length < 16 || clientId.length > 100) {
    return invalid;
  }
  const { data, error } = await createClient().rpc("send_cheer", { p_cheer: cheer, p_client: clientId });
  if (error) return error.code === "22023" ? invalid : unavailable;
  const row = data?.[0];
  if (row?.status === "sent" && typeof row.id === "number") return { ok: true, status: "sent", id: row.id };
  if (row?.status === "too_fast" || row?.status === "busy") return { ok: true, status: row.status };
  return unavailable;
}
