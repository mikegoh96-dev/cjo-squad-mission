"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SparkleIcon } from "@/components/icons";

const COLORS = ["#3d5fe0", "#6a4ae0", "#16a34a", "#f5a524", "#f97316", "#ec4899"];
// Fixed layout so server and client agree; motion is CSS-only and hidden for reduced motion.
const PIECES = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i % 6) * 0.12,
  drift: ((i * 53) % 120) - 60,
  color: COLORS[i % COLORS.length],
  round: i % 3 === 0,
}));

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

  if (!show) return null;
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
        <div role="status" className="animate-toast flex items-center gap-3 rounded-[22px] bg-surface p-4 shadow-card ring-1 ring-hairline">
          <span className="bg-brand flex size-11 shrink-0 items-center justify-center rounded-2xl text-white">
            <SparkleIcon className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-extrabold">{title}</p>
            <p className="text-[14px] text-muted">{message}</p>
          </div>
          <button
            type="button"
            onClick={() => setShow(false)}
            className="shrink-0 rounded-full px-3 py-2 text-[14px] font-semibold text-accent-strong"
          >
            Nice!
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
