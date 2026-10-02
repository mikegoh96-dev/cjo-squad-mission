import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

/**
 * Supabase client for server code (Server Components, Server Actions).
 * Uses the publishable key with no user session: it can only do what the
 * anon role may do (public reads + the token-gated update function).
 */
export function createClient() {
  const { url, publishableKey } = getSupabaseEnv();
  return createSupabaseClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
