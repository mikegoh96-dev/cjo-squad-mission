"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { parseEmail } from "@/lib/validation/email";
import { LOGIN_PATH, SIGNED_IN_HOME_PATH } from "./routes";
import { safeNextPath } from "./safe-next-path";

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

/** Emails a sign-in link. The same link confirms new email addresses. */
export async function signInWithEmail(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Sign-in is not available yet." };
  }

  const email = parseEmail(formData.get("email"));
  if (!email) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const next = safeNextPath(
    formData.get("next")?.toString(),
    SIGNED_IN_HOME_PATH,
  );
  const redirectTo = new URL("/auth/confirm", await requestOrigin());
  redirectTo.searchParams.set("next", next);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo.toString() },
  });

  if (error) {
    return {
      status: "error",
      message:
        error.status === 429
          ? "Too many attempts. Please wait a minute and try again."
          : "We couldn't send a sign-in link. Please try again.",
    };
  }
  return { status: "sent", email };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(LOGIN_PATH);
}

/** Origin of the current request (Server Actions always send Origin). */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
