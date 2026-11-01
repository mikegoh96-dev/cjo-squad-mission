// Read-only phone-settings lookup from the browser. They call the
// same anon functions the server would, but directly, so they never queue in
// front of a card's save (Next.js runs a page's Server Actions one at a time).
// Writes stay Server Actions (src/app/(dashboard)/squad-actions.ts).
import { getBrowserClient } from "@/lib/supabase/browser";

export type DevicePrefs = { activity: boolean; milestones: boolean; reminders: boolean; recap: boolean };
export type DeviceSettings = { memberId: string | null; prefs: DevicePrefs };

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

