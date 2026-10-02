import "server-only";
import { cookies } from "next/headers";
import { isWellFormedUpdateToken } from "@/lib/update-token";

// After a member saves from their private link, this device remembers the
// link so "Update my cases" on the dashboard opens it directly. The cookie
// holds the same credential as the URL: httpOnly (no script access), Secure in
// production, SameSite=Lax, scoped to this site only.
const COOKIE = "cjo_update_link";
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60; // browser maximum

export async function getRememberedToken(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  return isWellFormedUpdateToken(value) ? value : null;
}

/** Only call from Server Actions or Route Handlers. */
export async function rememberToken(token: string) {
  if (!isWellFormedUpdateToken(token)) return;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Only call from Server Actions or Route Handlers. */
export async function forgetToken() {
  (await cookies()).delete(COOKIE);
}
