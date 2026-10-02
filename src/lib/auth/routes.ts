export const LOGIN_PATH = "/login";

/** Where users land after signing in. */
export const SIGNED_IN_HOME_PATH = "/squad";

/** Path prefixes that require a signed-in user. */
const PROTECTED_PREFIXES = ["/squad"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Login URL that returns the user to `next` after signing in. */
export function loginPathFor(next: string): string {
  return `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}
