import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  LOGIN_PATH,
  SIGNED_IN_HOME_PATH,
  isProtectedPath,
  loginPathFor,
} from "@/lib/auth/routes";
import type { Database } from "./database.types";
import { getSupabaseEnv, isSupabaseConfigured } from "./env";

/**
 * Refreshes the Supabase auth session cookie and applies optimistic route
 * protection. Pages and actions must still verify the user themselves
 * (src/lib/auth/dal.ts); RLS is the final authority on data.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname, search } = request.nextUrl;

  if (!isSupabaseConfigured()) {
    // Fail closed: without auth configured nobody can be signed in.
    return isProtectedPath(pathname)
      ? redirectTo(request, response, loginPathFor(pathname + search))
      : response;
  }

  const { url, publishableKey } = getSupabaseEnv();
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not run code between createServerClient and getClaims(): getClaims()
  // validates the token and triggers the refresh that keeps users signed in.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims);

  if (!isSignedIn && isProtectedPath(pathname)) {
    return redirectTo(request, response, loginPathFor(pathname + search));
  }
  if (isSignedIn && pathname === LOGIN_PATH) {
    return redirectTo(request, response, SIGNED_IN_HOME_PATH);
  }

  // Return this exact response so refreshed auth cookies reach the browser.
  return response;
}

/** Redirects while keeping any refreshed auth cookies from `response`. */
function redirectTo(
  request: NextRequest,
  response: NextResponse,
  target: string,
) {
  const redirect = NextResponse.redirect(new URL(target, request.url));
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
