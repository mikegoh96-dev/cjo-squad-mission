"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveCaseCount } from "@/app/(dashboard)/actions";
import { CheckIcon, MinusIcon, PlusIcon, RefreshIcon } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { applyTap, cheerFor } from "@/lib/board";
import { useLiveBoard } from "./live-board";

type Status =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "conflict"; current: number }
  | { kind: "error" };

/** Wait this long after the last tap, then save once (fast taps = one save). */
const SAVE_DELAY_MS = 600;
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
}: {
  id: string;
  name: string;
  initials: string;
  serverCount: number;
}) {
  const { editable, setLocal } = useLiveBoard();
  const [display, setDisplay] = useState(serverCount);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [fx, setFx] = useState<Fx[]>([]);
  const [bump, setBump] = useState(0);
  const [cheer, setCheer] = useState<string | null>(null);

  const displayRef = useRef(serverCount);
  const confirmed = useRef(serverCount);
  const inFlight = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const taps = useRef(0);

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
      confirmed.current = serverCount;
      show(serverCount);
    }
  }, [serverCount, show]);

  // Saves until the stored total matches what the card shows (taps made while
  // a save is in flight are saved right after it).
  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (inFlight.current) return; // the running loop picks up new taps
    inFlight.current = true;
    let savedAny = false;
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
          setStatus({ kind: "error" }); // offline: keep the number, offer Retry
          return;
        }
        if (result.status === "conflict") {
          confirmed.current = result.currentCount;
          show(result.currentCount);
          setStatus({ kind: "conflict", current: result.currentCount });
          return;
        }
        if (result.status === "error") {
          setStatus({ kind: "error" });
          return;
        }
        confirmed.current = result.caseCount;
        savedAny = true;
      }
      setStatus(savedAny ? { kind: "saved" } : { kind: "idle" }); // e.g. +1 then -1 before saving
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
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      onHide();
    };
  }, [flush]);

  // "Saved" fades back to idle.
  useEffect(() => {
    if (status.kind !== "saved") return;
    const t = window.setTimeout(() => setStatus({ kind: "idle" }), 1600);
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

  // Shrink as digits grow so the number never collides with the -/+ buttons.
  const size = display >= 1000 ? "text-[21px]" : display >= 100 ? "text-[26px]" : display >= 10 ? "text-[34px]" : "text-[42px]";
  return (
    <li
      data-testid="member-card"
      data-member={name}
      data-member-id={id}
      className="relative flex flex-col overflow-hidden rounded-[26px] bg-surface p-3.5 shadow-card"
    >
      {bump > 0 ? <span key={`glow-${bump}`} aria-hidden="true" className="animate-card-glow pointer-events-none absolute inset-0 rounded-[26px]" /> : null}

      <div className="flex min-w-0 items-center gap-2">
        <Avatar name={name} id={id} initials={initials} size="sm" />
        <h3 className="min-w-0 truncate text-[16px] font-bold">{name}</h3>
      </div>

      <div className="relative mt-3 flex items-center justify-between gap-1">
        {editable ? (
          <button
            type="button"
            aria-label={`Remove a case from ${name}`}
            onClick={() => tap(-1)}
            disabled={display <= 0}
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-foreground transition-transform active:scale-90 disabled:opacity-35"
          >
            <MinusIcon className="size-5" />
          </button>
        ) : null}

        <span className="relative flex min-w-0 flex-1 justify-center">
          <span
            key={`n-${bump}`}
            data-testid="member-count"
            aria-live="polite"
            className={`${bump > 0 ? "animate-number-pop" : ""} ${size} leading-none font-extrabold tracking-tight tabular-nums`}
          >
            {display}
          </span>
          {fx.map((f) => (
            <span
              key={f.id}
              aria-hidden="true"
              className="animate-float-up pointer-events-none absolute -top-7 text-[18px] font-extrabold text-accent"
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
            className="bg-brand relative flex size-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-[0_8px_18px_-8px_rgba(61,95,224,0.9)] transition-transform active:scale-90 disabled:opacity-35"
          >
            <PlusIcon className="size-5" />
            {bump > 0
              ? BURST.map((b, i) => (
                  <span
                    key={`${bump}-${i}`}
                    aria-hidden="true"
                    className="animate-burst pointer-events-none absolute top-1/2 left-1/2 size-1.5 rounded-full"
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

      <p className="mt-2 flex min-h-5 items-center justify-center gap-1 text-center text-[12px] font-semibold" data-testid="member-status">
        {status.kind === "error" ? (
          <button type="button" onClick={() => void flush()} className="inline-flex items-center gap-1 text-danger-text">
            <RefreshIcon className="size-3.5" />
            Not saved · Retry
          </button>
        ) : status.kind === "conflict" ? (
          <span className="text-warning-text">Updated elsewhere: now {status.current}</span>
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
    </li>
  );
}
