import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

let client: SupabaseClient<Database> | null = null;

/**
 * Browser Supabase client, used ONLY for Realtime (live updates). Publishable
 * key, no session: it can receive what the anon role may read, nothing more.
 * All reads and writes still go through the server.
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
