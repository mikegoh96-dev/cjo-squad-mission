import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Runs as the signed-in user, so Row Level Security applies.
 *
 * Create a new client per request; never store it in a module-level variable.
 */
export async function createClient() {
  // Read cookies first: it marks the route as dynamic even if env is missing,
  // so Next.js never tries to prerender user-specific pages at build time.
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, which cannot set cookies.
          // Safe to ignore: src/proxy.ts refreshes the session.
        }
      },
    },
  });
}
