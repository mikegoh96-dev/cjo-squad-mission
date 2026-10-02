import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { LOGIN_PATH } from "./routes";

/**
 * Verifies the signed-in user (JWT checked by getClaims) or redirects to the
 * login page. Call this in every protected page, action and route handler;
 * the proxy redirect alone is not a security boundary.
 */
export const verifySession = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect(LOGIN_PATH);
  }

  return { userId: data.claims.sub, email: data.claims.email ?? null };
});
