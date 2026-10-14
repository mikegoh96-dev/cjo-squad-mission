// Read-only check-in / phone-settings lookups from the browser. They call the
// same anon functions the server would, but directly, so they never queue in
// front of a card's save (Next.js runs a page's Server Actions one at a time).
// Writes stay Server Actions (src/app/(dashboard)/squad-actions.ts).
import { getBrowserClient } from "@/lib/supabase/browser";

export type DevicePrefs = { activity: boolean; milestones: boolean; reminders: boolean; recap: boolean };
export type DeviceSettings = { memberId: string | null; prefs: DevicePrefs };
export type Checkin = { month: string; confirmed: boolean; confirmedCount: number | null; confirmedAt: string | null };

/** "off" = not available (V2 not applied / offline); null = no row. */
export async function fetchDeviceSettings(endpoint: string): Promise<DeviceSettings | null | "off"> {
  try {
    const { data, error } = await getBrowserClient().rpc("get_push_device_settings", { p_endpoint: endpoint });
    if (error) return "off";
    const row = data?.[0];
    if (!row) return null;
    return {
      memberId: row.squad_member_id,
      prefs: { activity: row.activity, milestones: row.milestones, reminders: row.reminders, recap: row.recap },
    };
  } catch {
    return "off";
  }
}

/** One member's check-in for the open month; null = no open month. */
export async function fetchCheckin(memberId: string): Promise<Checkin | null | "off"> {
  try {
    const { data, error } = await getBrowserClient().rpc("get_checkin", { p_squad_member_id: memberId });
    if (error) return "off";
    const row = data?.[0];
    if (!row) return null;
    return { month: row.month, confirmed: row.confirmed, confirmedCount: row.confirmed_count, confirmedAt: row.confirmed_at };
  } catch {
    return "off";
  }
}
