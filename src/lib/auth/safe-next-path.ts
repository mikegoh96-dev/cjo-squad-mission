import type { Route } from "next";

/**
 * Returns `value` only if it is a same-origin path, otherwise "/".
 * Prevents open redirects via `?next=https://evil.example` or `//evil.example`.
 */
export function safeNextPath(value: string | null | undefined): Route {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return "/";
  }
  return value as Route;
}
