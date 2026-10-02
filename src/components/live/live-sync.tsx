"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";

// ---------------------------------------------------------------------------
// Live status store (shared by <LiveSync> and <LiveDot>)
// ---------------------------------------------------------------------------
type Status = "connecting" | "live" | "polling";
let status: Status = "connecting";
const listeners = new Set<() => void>();
function setStatus(next: Status) {
  if (next === status) return;
  status = next;
  listeners.forEach((l) => l());
}
function useLiveStatus(): Status {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
    () => "connecting",
  );
}

/** Coalesce bursts of changes (e.g. fast taps on another phone) into one refresh. */
const REFRESH_DELAY_MS = 400;
/** Safety net: re-check this often while visible (Realtime down or not enabled). */
const POLL_MS = 15_000;
/** When Realtime is connected, still re-check occasionally. */
const LIVE_POLL_MS = 60_000;

/**
 * Keeps the dashboard and Mission screen in sync with every other phone:
 * Supabase Realtime pushes changes to case counts / squad membership and the
 * page re-fetches fresh server data. Also refreshes on a timer while visible,
 * when the app comes back to the foreground and when the network returns.
 * Cards with unsaved taps keep their local value (see MemberCard).
 */
export function LiveSync() {
  const router = useRouter();

  useEffect(() => {
    let timer: number | undefined;
    let pollTimer: number | undefined;
    // Every refresh (from any trigger) restarts the safety-net timer, so the
    // longest a screen can lag is one poll interval.
    const schedulePoll = () => {
      window.clearTimeout(pollTimer);
      pollTimer = window.setTimeout(
        () => (document.visibilityState === "visible" ? refresh() : schedulePoll()),
        status === "live" ? LIVE_POLL_MS : POLL_MS,
      );
    };
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        router.refresh();
        schedulePoll();
      }, REFRESH_DELAY_MS);
    };
    schedulePoll();

    let channel: ReturnType<ReturnType<typeof getBrowserClient>["channel"]> | null = null;
    try {
      const supabase = getBrowserClient();
      channel = supabase
        .channel("squad-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "member_case_counts" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "squad_members" }, refresh)
        .subscribe((s) => {
          if (s === "SUBSCRIBED") setStatus("live");
          else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("polling");
        });
    } catch {
      setStatus("polling");
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", refresh);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(pollTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", refresh);
      if (channel) void getBrowserClient().removeChannel(channel);
    };
  }, [router]);

  return null;
}

/** Small "Live" badge: icon + label, never colour alone. */
export function LiveDot() {
  const s = useLiveStatus();
  if (s === "connecting") return null;
  return (
    <span className="inline-flex items-center gap-1.5 align-middle text-[12px] font-semibold" data-testid="live-status">
      <span aria-hidden="true" className="relative flex size-2">
        {s === "live" ? <span className="animate-ping-soft absolute inset-0 rounded-full bg-good" /> : null}
        <span className={`relative size-2 rounded-full ${s === "live" ? "bg-good" : "bg-muted"}`} />
      </span>
      <span className={s === "live" ? "text-good-text" : "text-muted"}>{s === "live" ? "Live" : "Auto-updating"}</span>
    </span>
  );
}
