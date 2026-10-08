"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, RefreshIcon, SparkleIcon } from "@/components/icons";
import { applyUpdate, CURRENT_VERSION, hasUnsavedTaps, isNewer, latestVersion, shortVersion } from "@/lib/app-version";

/** How often an open app checks for a new version. */
const CHECK_EVERY_MS = 5 * 60 * 1000;
const RELOADED_KEY = "cjo:updated-to";

/** Reload once per new version; if that didn't take (stale copy), offer the banner instead. */
function alreadyTried(version: string): boolean {
  try {
    if (sessionStorage.getItem(RELOADED_KEY) === version) return true;
    sessionStorage.setItem(RELOADED_KEY, version);
  } catch {}
  return false;
}

/**
 * Keeps a Home Screen app current without re-adding it:
 * - coming back to the app (it was paused in the background) with a new
 *   version live: reload straight away, unless taps are still saving;
 * - a new version goes live while the app is open: show an "Update" banner.
 */
export function UpdateWatcher() {
  const [available, setAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async (resumed: boolean) => {
      const latest = await latestVersion();
      if (cancelled || !isNewer(latest)) return;
      if (resumed && !hasUnsavedTaps() && !alreadyTried(latest)) {
        void applyUpdate();
        return;
      }
      setAvailable(true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check(true);
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void check(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void check(false);
    }, CHECK_EVERY_MS);
    void check(false);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.clearInterval(timer);
    };
  }, []);

  if (!available) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(10px,env(safe-area-inset-top))] z-50 flex justify-center px-4">
      <div
        role="status"
        data-testid="update-banner"
        className="animate-toast pointer-events-auto flex items-center gap-3 rounded-full bg-surface py-2 pr-2 pl-4 shadow-card"
      >
        <SparkleIcon className="size-4 shrink-0 text-violet" />
        <span className="text-[14px] font-bold">New version ready</span>
        <button
          type="button"
          onClick={() => {
            setUpdating(true);
            void applyUpdate();
          }}
          disabled={updating}
          className="btn-3d btn-3d-brand min-h-11 rounded-full px-4 py-2 text-[14px] font-extrabold disabled:opacity-70"
        >
          {updating ? "Updating…" : "Update"}
        </button>
      </div>
    </div>
  );
}

type CheckState = "idle" | "checking" | "updating" | "latest" | "offline";

/** "Check for updates" at the bottom of every screen (Home Screen apps have no reload). */
export function UpdateButton() {
  const [state, setState] = useState<CheckState>("idle");
  const reset = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(reset.current), []);

  async function check() {
    window.clearTimeout(reset.current);
    setState("checking");
    const latest = await latestVersion();
    if (isNewer(latest)) {
      setState("updating");
      await applyUpdate();
      return;
    }
    setState(latest === null ? "offline" : "latest");
    reset.current = window.setTimeout(() => setState("idle"), 3500);
  }

  return (
    <div className="mt-2 flex flex-col items-center gap-1 text-center" data-testid="app-version">
      <button
        type="button"
        onClick={check}
        disabled={state === "checking" || state === "updating"}
        className="btn-3d btn-3d-soft inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-muted disabled:opacity-70"
      >
        {state === "latest" ? (
          <CheckIcon className="size-4 text-good-text" />
        ) : (
          <RefreshIcon className={`size-4 ${state === "checking" || state === "updating" ? "animate-spin" : ""}`} />
        )}
        <span aria-live="polite">
          {state === "checking"
            ? "Checking…"
            : state === "updating"
              ? "Updating…"
              : state === "latest"
                ? "You're on the latest version"
                : state === "offline"
                  ? "Can't check right now. Try again"
                  : "Check for updates"}
        </span>
      </button>
      {CURRENT_VERSION ? (
        <span className="text-[11px] font-medium text-muted tabular-nums">Version {shortVersion(CURRENT_VERSION)}</span>
      ) : null}
    </div>
  );
}
