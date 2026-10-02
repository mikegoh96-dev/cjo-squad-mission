import "server-only";
import { cookies } from "next/headers";
import { isUuid } from "@/lib/ids";

// Remembers which squad member this device last updated, so "Update my cases"
// opens straight to them. A convenience only: it is NOT a credential (anyone
// with the shared link can pick any member).
const COOKIE = "cjo_member";
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60; // browser maximum

export async function getRememberedMember(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  return isUuid(value) ? value.toLowerCase() : null;
}

/** Only call from Server Actions or Route Handlers. */
export async function rememberMember(squadMemberId: string) {
  if (!isUuid(squadMemberId)) return;
  (await cookies()).set(COOKIE, squadMemberId.toLowerCase(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Only call from Server Actions or Route Handlers. */
export async function forgetMember() {
  (await cookies()).delete(COOKIE);
}
