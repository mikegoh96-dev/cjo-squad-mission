import type { Route } from "next";

/**
 * Returns `value` only if it is a same-origin path, otherwise `fallback`.
 * Prevents open redirects via `?next=https://evil.example` or `//evil.example`.
 */
export function safeNextPath(
  value: string | null | undefined,
  fallback: Route = "/",
): Route {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return fallback;
  }
  return value as Route;
}
