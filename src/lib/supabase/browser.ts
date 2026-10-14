import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

let client: SupabaseClient<Database> | null = null;

/**
 * Browser Supabase client: Realtime (live updates) plus a few small anon
 * reads (recent cheers, this phone's check-in and alert settings) that must
 * not queue behind card saves. Publishable key, no session: it can do only
 * what the anon role may do. All writes go through the server.
 */
export function getBrowserClient(): SupabaseClient<Database> {
  if (!client) {
    const { url, publishableKey } = getSupabaseEnv();
    client = createClient<Database>(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return client;
}
