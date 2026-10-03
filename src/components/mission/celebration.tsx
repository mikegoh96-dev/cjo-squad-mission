"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Star3D } from "@/components/art/objects";
import { XIcon } from "@/components/icons";

const COLORS = ["#3d5fe0", "#6a4ae0", "#16a34a", "#f5a524", "#f97316", "#ec4899"];
// Fixed layout so server and client agree; motion is CSS-only and hidden for reduced motion.
const PIECES = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i % 6) * 0.12,
  drift: ((i * 53) % 120) - 60,
  color: COLORS[i % COLORS.length],
  round: i % 3 === 0,
}));

/** Drag further than this (px) sideways, or flick up this far, to dismiss. */
const SWIPE_X = 80;
const SWIPE_UP = 40;

function readCelebrated(key: string): number | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? 0 : Number(raw) || 0;
  } catch {
    return null; // storage blocked: skip rather than repeat on every visit
  }
}

/**
 * A short milestone celebration (toast + light confetti).
 * - `once`: celebrate each milestone at most once per device (dashboard).
 * - otherwise: celebrate now (right after the save that crossed it).
 */
export function Celebration({
  title,
  message,
  cases,
  storageKey,
}: {
  title: string;
  message: string;
  cases: number;
  storageKey?: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let reveal = !storageKey;
    if (storageKey) {
      const seen = readCelebrated(storageKey);
      if (seen !== null && cases > seen) {
        reveal = true;
        try {
          window.localStorage.setItem(storageKey, String(cases));
        } catch {}
      }
    }
    if (!reveal) return;
    const showTimer = window.setTimeout(() => setShow(true), 350);
    const hideTimer = window.setTimeout(() => setShow(false), 6500);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [storageKey, cases]);

  // Swipe to dismiss (left, right or up); taps elsewhere are unaffected.
  const start = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<null | { x: number; y: number }>(null);
  const dismiss = (dir = { x: 0, y: -1 }) => {
    setLeaving({ x: dir.x * 420, y: dir.y * 160 });
    window.setTimeout(() => setShow(false), 200);
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    start.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    setDrag({ x: e.clientX - start.current.x, y: Math.min(0, e.clientY - start.current.y) });
  };
  const onPointerEnd = () => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (Math.abs(drag.x) > SWIPE_X) dismiss({ x: Math.sign(drag.x), y: 0 });
    else if (drag.y < -SWIPE_UP) dismiss({ x: 0, y: -1 });
    else setDrag({ x: 0, y: 0 }); // snap back
  };

  if (!show) return null;
  const offset = leaving ?? drag;
  // Portal to <body>: a transformed (animating) ancestor would otherwise trap `position: fixed`.
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden text-left" data-testid="celebration">
      {PIECES.map((p, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`animate-confetti absolute top-0 block h-3 w-2 ${p.round ? "rounded-full" : "rounded-[2px]"}`}
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              animationDelay: `${p.delay}s`,
              "--drift": `${p.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
      <div className="pointer-events-auto mx-auto mt-[max(16px,env(safe-area-inset-top))] w-[calc(100%-32px)] max-w-md">
        <div
          role="status"
          data-testid="celebration-toast"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            opacity: leaving ? 0 : 1 - Math.min(0.6, Math.max(Math.abs(offset.x) / 300, Math.abs(offset.y) / 150)),
            transition: dragging && !leaving ? "none" : "transform 200ms ease-out, opacity 200ms ease-out",
          }}
          className="animate-toast flex touch-none items-center gap-3 rounded-tile bg-surface p-4 shadow-card ring-1 ring-hairline select-none"
        >
          <span className="bg-brand flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-[0_3px_0_var(--hero-lip)]">
            <Star3D className="animate-unlock size-10" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-extrabold">{title}</p>
            <p className="text-[14px] text-muted">{message}</p>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss()}
            className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 active:bg-surface-2"
          >
            <XIcon className="size-5" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
