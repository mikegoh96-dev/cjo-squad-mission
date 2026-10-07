"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Celebration } from "@/components/mission/celebration";
import { withLocalChanges } from "@/lib/board";
import { crossedMilestone, pluralCases } from "@/lib/mission";

type LiveBoard = {
  /** Totals the server last rendered (current month). */
  serverCounts: Record<string, number>;
  /** Totals including this screen's unsaved / just-saved taps. */
  counts: Record<string, number>;
  /** Squad total for the month, live. */
  total: number;
  /** Local change on top of the server values (for momentum). */
  delta: number;
  editable: boolean;
  setLocal: (id: string, value: number) => void;
  /** A teammate's cases arrived from another phone: show a short pop-up. */
  announce: (name: string, added: number) => void;
};

const Ctx = createContext<LiveBoard | null>(null);

/** The live board when inside the dashboard; null elsewhere (e.g. the Mission screen). */
export function useOptionalLiveBoard(): LiveBoard | null {
  return useContext(Ctx);
}

export function useLiveBoard(): LiveBoard {
  const value = useContext(Ctx);
  if (!value) throw new Error("useLiveBoard must be used inside <LiveBoardProvider>");
  return value;
}

/**
 * Holds the squad's current-month totals on the dashboard so every tap updates
 * the hero, momentum, month card and squad total instantly. Server refreshes
 * (after saves, or navigation) flow in through `serverCounts`.
 */
export function LiveBoardProvider({
  serverCounts,
  editable,
  target,
  monthLabel,
  celebrationKey,
  children,
}: {
  serverCounts: Record<string, number>;
  editable: boolean;
  target: number;
  monthLabel: string;
  celebrationKey: string;
  children: React.ReactNode;
}) {
  const [local, setLocalState] = useState<Record<string, number>>({});
  const setLocal = useCallback((id: string, value: number) => {
    setLocalState((prev) => (prev[id] === value ? prev : { ...prev, [id]: value }));
  }, []);

  const { counts, delta, total } = useMemo(() => withLocalChanges(serverCounts, local), [serverCounts, local]);

  // Celebrate the moment a tap carries the squad past a milestone.
  const previous = useRef(total);
  const [celebration, setCelebration] = useState<{ label: string; cases: number; n: number } | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = total;
    const crossed = crossedMilestone(before, total, target, monthLabel);
    if (crossed) setCelebration((c) => ({ label: crossed.label, cases: crossed.cases, n: (c?.n ?? 0) + 1 }));
  }, [total, target, monthLabel]);

  // In-app pop-ups for teammates' updates (one at a time, newest wins).
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const announce = useCallback((name: string, added: number) => {
    setToast((t) => ({ text: `${name} added ${added === 1 ? "a case" : pluralCases(added)}`, n: (t?.n ?? 0) + 1 }));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const value = useMemo(
    () => ({ serverCounts, counts, total, delta, editable, setLocal, announce }),
    [serverCounts, counts, total, delta, editable, setLocal, announce],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {celebration ? (
        <Celebration
          key={celebration.n}
          title={`${celebration.label}!`}
          message={`The squad just hit ${pluralCases(celebration.cases)} in ${monthLabel}. Keep going!`}
          cases={celebration.cases}
          storageKey={celebrationKey}
        />
      ) : null}
      {toast
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 bottom-[calc(max(12px,env(safe-area-inset-bottom))+84px)] z-40 flex justify-center px-4">
              <p
                key={toast.n}
                role="status"
                data-testid="teammate-toast"
                className="animate-toast btn-3d-brand rounded-full px-4 py-2.5 text-[14px] font-extrabold shadow-card"
              >
                🎉 {toast.text}
              </p>
            </div>,
            document.body,
          )
        : null}
    </Ctx.Provider>
  );
}
