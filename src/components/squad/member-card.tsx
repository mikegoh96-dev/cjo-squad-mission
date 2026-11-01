"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveCaseCount } from "@/app/(dashboard)/actions";
import { CheckIcon, MinusIcon, PlusIcon, RefreshIcon } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { applyTap, cheerFor, rebaseTaps } from "@/lib/board";
import { setUnsaved } from "@/lib/app-version";
import { useLiveBoard } from "./live-board";

type Status =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "merged"; other: number }
  | { kind: "conflict"; current: number }
  | { kind: "error" };

/** Wait this long after the last tap, then save once (fast taps = one save). */
const SAVE_DELAY_MS = 600;
/** Give up merging after this many conflicts in a row (someone else keeps saving). */
const MAX_MERGES = 3;
const BURST = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2;
  return { dx: Math.round(Math.cos(angle) * 46), dy: Math.round(Math.sin(angle) * 46), hue: i % 3 };
});
const BURST_COLORS = ["var(--brand-from)", "var(--brand-to)", "#f5a524"];

type Fx = { id: number; text: string };

/**
 * One squad member's big card: name, this month's total and -/+ buttons.
 * Taps update instantly (optimistic); saves are debounced and conflict-safe
 * (the server only writes if the stored total still equals the last value
 * this card confirmed).
 */
export function MemberCard({
  id,
  name,
  initials,
  serverCount,
  children,
}: {
  id: string;
  name: string;
  initials: string;
  serverCount: number;
  /** Extra content under the case count (the PC$ field while a challenge is open). */
  children?: React.ReactNode;
}) {
  const { editable, setLocal, announce } = useLiveBoard();
  const [display, setDisplay] = useState(serverCount);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [fx, setFx] = useState<Fx[]>([]);
  const [bump, setBump] = useState(0);
  const [remote, setRemote] = useState(0); // updates arriving from other phones
  const [cheer, setCheer] = useState<string | null>(null);

  const displayRef = useRef(serverCount);
  const confirmed = useRef(serverCount);
  const inFlight = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const taps = useRef(0);
  // True after a save whose outcome is unknown (the request failed, so it may
  // or may not have been written). Merging then could count taps twice, so a
  // conflict falls back to showing the stored total.
  const uncertain = useRef(false);

  const show = useCallback((value: number) => {
    displayRef.current = value;
    setDisplay(value);
  }, []);

  // Report this card's live total to the board (hero, momentum, squad total).
  useEffect(() => setLocal(id, display), [id, display, setLocal]);

  // New server data (after a save elsewhere or a refresh): adopt it unless this
  // card has unsaved taps or a save in flight.
  useEffect(() => {
    if (!inFlight.current && displayRef.current === confirmed.current) {
      const before = displayRef.current;
      confirmed.current = serverCount;
      show(serverCount);
      if (serverCount > before) {
        // A teammate added cases on another phone: glow, pop and float "+n".
        const fxId = Date.now() + Math.random();
        setRemote((r) => r + 1);
        setFx((list) => [...list.slice(-4), { id: fxId, text: `+${serverCount - before}` }]);
        window.setTimeout(() => setFx((list) => list.filter((f) => f.id !== fxId)), 900);
        setCheer("Just added!");
        announce(name, serverCount - before);
      }
    }
  }, [serverCount, show, announce, name]);

  // Saves until the stored total matches what the card shows (taps made while
  // a save is in flight are saved right after it).
  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (inFlight.current) return; // the running loop picks up new taps
    inFlight.current = true;
    let savedAny = false;
    let merges = 0;
    let other = 0; // cases another phone added that this save was combined with
    try {
      while (displayRef.current !== confirmed.current) {
        setStatus({ kind: "saving" });
        let result: Awaited<ReturnType<typeof saveCaseCount>>;
        try {
          result = await saveCaseCount({
            squadMemberId: id,
            caseCount: displayRef.current,
            expectedCount: confirmed.current,
          });
        } catch {
          uncertain.current = true;
          setStatus({ kind: "error" }); // offline: keep the number, offer Retry
          return;
        }
        // "unchanged" means the stored total already equals what we sent, though we
        // expected a different value. After a failed request that is our own earlier
        // save that landed (keep it). Otherwise another phone saved the same total first
        // (both tapped +1 from the same count): nothing of ours was written, so it is a
        // conflict and our taps go on top.
        const current =
          result.status === "conflict"
            ? result.currentCount
            : result.status === "unchanged" && !uncertain.current
              ? result.caseCount
              : null;
        if (current !== null) {
          // Another phone changed this total first; nothing was written.
          if (uncertain.current || merges >= MAX_MERGES) {
            uncertain.current = false;
            confirmed.current = current;
            show(current);
            setStatus({ kind: "conflict", current });
            return;
          }
          merges += 1;
          other += current - confirmed.current;
          const merged = rebaseTaps(displayRef.current, confirmed.current, current);
          confirmed.current = current;
          show(merged);
          continue; // save the combined total
        }
        if (result.status === "error" || result.status === "conflict") {
          setStatus({ kind: "error" }); // (conflict is always handled above)
          return;
        }
        uncertain.current = false;
        confirmed.current = result.caseCount;
        savedAny = true;
      }
      // e.g. +1 then -1 before saving: nothing to report
      setStatus(merges > 0 ? { kind: "merged", other } : savedAny ? { kind: "saved" } : { kind: "idle" });
    } finally {
      inFlight.current = false;
    }
  }, [id, show]);

  // Save pending taps if the page is hidden or the card unmounts.
  useEffect(() => {
    const onHide = () => {
      if (displayRef.current !== confirmed.current) void flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    // Back online: save what the offline taps changed without waiting for Retry.
    window.addEventListener("online", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("online", onHide);
      onHide();
    };
  }, [flush]);

  // Taps waiting, saving or not saved: an app update must not reload over them.
  useEffect(() => {
    setUnsaved(id, status.kind === "pending" || status.kind === "saving" || status.kind === "error");
    return () => setUnsaved(id, false);
  }, [id, status.kind]);

  // "Saved" fades back to idle; the longer notes stay a little longer.
  useEffect(() => {
    if (status.kind !== "saved" && status.kind !== "merged" && status.kind !== "conflict") return;
    const t = window.setTimeout(() => setStatus({ kind: "idle" }), status.kind === "saved" ? 1600 : 4000);
    return () => window.clearTimeout(t);
  }, [status]);

  const tap = (delta: number) => {
    const next = applyTap(displayRef.current, delta);
    if (next === displayRef.current) return;
    show(next);
    setStatus({ kind: "pending" });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    if (delta > 0) {
      // Hype: number pop, floating +1, burst, cheer, a tiny buzz.
      taps.current += 1;
      const fxId = Date.now() + Math.random();
      setBump((b) => b + 1);
      setFx((list) => [...list.slice(-4), { id: fxId, text: `+${delta}` }]);
      window.setTimeout(() => setFx((list) => list.filter((f) => f.id !== fxId)), 900);
      setCheer(cheerFor(taps.current - 1));
      navigator.vibrate?.(12);
    }
  };

  useEffect(() => {
    if (!cheer) return;
    const t = window.setTimeout(() => setCheer(null), 1300);
    return () => window.clearTimeout(t);
  }, [cheer, bump]);

  // Shrink as digits grow, and to the room between the -/+ buttons (container
  // width minus two 44px buttons and gaps; a digit is ~0.58em), so the number
  // never touches them.
  const digits = String(display).length;
  const maxPx = digits >= 4 ? 21 : digits === 3 ? 26 : digits === 2 ? 34 : 42;
  const fontSize = `min(${maxPx}px, calc((100cqw - 96px) / ${(digits * 0.58).toFixed(2)}))`;
  return (
    <li
      data-testid="member-card"
      data-member={name}
      data-member-id={id}
      className="@container relative flex flex-col overflow-hidden rounded-tile bg-surface p-3.5 shadow-card"
    >
      {bump + remote > 0 ? <span key={`glow-${bump}-${remote}`} aria-hidden="true" className="animate-card-glow pointer-events-none absolute inset-0 rounded-tile" /> : null}

      <div className="flex min-w-0 items-center gap-2">
        <Avatar name={name} id={id} initials={initials} size="md" />
        <h3 className="min-w-0 truncate text-[16px] font-bold">{name}</h3>
      </div>

      <div className="relative mt-3 flex items-center justify-between gap-1">
        {editable ? (
          <button
            type="button"
            aria-label={`Remove a case from ${name}`}
            onClick={() => tap(-1)}
            disabled={display <= 0}
            className="btn-3d btn-3d-soft flex size-11 shrink-0 items-center justify-center rounded-2xl disabled:opacity-35"
          >
            <MinusIcon className="size-5" />
          </button>
        ) : null}

        <span className="relative flex min-w-0 flex-1 justify-center">
          <span
            key={`n-${bump}-${remote}`}
            data-testid="member-count"
            aria-live="polite"
            className={`${bump + remote > 0 ? "animate-number-pop" : ""} leading-none font-extrabold tracking-tight tabular-nums`}
            style={{ fontSize }}
          >
            {display}
          </span>
          {fx.map((f) => (
            <span
              key={f.id}
              aria-hidden="true"
              className="animate-float-up btn-3d-brand pointer-events-none absolute -top-7 rounded-full px-2 py-0.5 text-[14px] font-extrabold"
            >
              {f.text}
            </span>
          ))}
        </span>

        {editable ? (
          <button
            type="button"
            aria-label={`Add a case for ${name}`}
            onClick={() => tap(1)}
            disabled={display >= 1000}
            className="btn-3d btn-3d-brand relative flex size-11 shrink-0 items-center justify-center rounded-2xl disabled:opacity-35"
          >
            <PlusIcon className="size-5 drop-shadow-[0_1px_0_rgba(20,30,90,0.35)]" />
            {bump > 0
              ? BURST.map((b, i) => (
                  <span
                    key={`${bump}-${i}`}
                    aria-hidden="true"
                    className="animate-burst sparkle pointer-events-none absolute top-1/2 left-1/2 size-2.5"
                    style={
                      {
                        background: BURST_COLORS[b.hue],
                        "--dx": `${b.dx}px`,
                        "--dy": `${b.dy}px`,
                      } as React.CSSProperties
                    }
                  />
                ))
              : null}
          </button>
        ) : null}
      </div>

      <p className="mt-2 flex min-h-5 items-center justify-center gap-1 text-center text-[12px] leading-tight font-semibold" data-testid="member-status">
        {status.kind === "error" ? (
          <button type="button" onClick={() => void flush()} className="inline-flex items-center gap-1 text-danger-text">
            <RefreshIcon className="size-3.5" />
            Not saved · Retry
          </button>
        ) : status.kind === "conflict" ? (
          <span className="text-warning-text">Updated elsewhere</span>
        ) : status.kind === "merged" ? (
          <span className="inline-flex items-center gap-1 text-good-text">
            <CheckIcon className="size-3.5" />
            {status.other > 0 ? `+${status.other} added elsewhere` : "Saved with another update"}
          </span>
        ) : cheer ? (
          <span key={`c-${bump}`} className="animate-pop text-violet">
            {cheer}
          </span>
        ) : status.kind === "saving" || status.kind === "pending" ? (
          <span className="text-muted">Saving…</span>
        ) : status.kind === "saved" ? (
          <span className="inline-flex items-center gap-1 text-good-text">
            <CheckIcon className="size-3.5" />
            Saved
          </span>
        ) : (
          <span className="text-muted">{display === 1 ? "case" : "cases"}</span>
        )}
      </p>
      {children}
    </li>
  );
}
