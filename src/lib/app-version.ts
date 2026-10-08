// Client-side app update helpers (Home Screen apps resume old copies and have
// no reload button, so the app checks for and applies updates itself).

/** The version this page was built from. */
export const CURRENT_VERSION = process.env.APP_VERSION ?? "";

/** Short label for the footer, e.g. "dpl_8f3k2a1" -> "8f3k2a1". */
export function shortVersion(version: string): string {
  return version.replace(/^dpl_/, "").replace(/^local-/, "").slice(0, 7);
}

/** The version the server is running now, or null if it can't be reached. */
export async function latestVersion(): Promise<string | null> {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown };
    return typeof body.version === "string" && body.version ? body.version : null;
  } catch {
    return null;
  }
}

export function isNewer(latest: string | null): latest is string {
  return latest !== null && CURRENT_VERSION !== "" && latest !== CURRENT_VERSION;
}

// Cards with taps not yet saved register here, so an update never reloads
// over them.
const unsaved = new Set<string>();
export function setUnsaved(id: string, dirty: boolean) {
  if (dirty) unsaved.add(id);
  else unsaved.delete(id);
}
export const hasUnsavedTaps = () => unsaved.size > 0;

/** Reload into the new version (after any pending saves finish, up to 6 s). */
export async function applyUpdate(): Promise<void> {
  for (let i = 0; i < 30 && hasUnsavedTaps(); i++) await new Promise((r) => setTimeout(r, 200));
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {}
  window.location.reload();
}
