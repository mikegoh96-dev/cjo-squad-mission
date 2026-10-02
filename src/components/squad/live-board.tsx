"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
};

const Ctx = createContext<LiveBoard | null>(null);

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

  const value = useMemo(
    () => ({ serverCounts, counts, total, delta, editable, setLocal }),
    [serverCounts, counts, total, delta, editable, setLocal],
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
    </Ctx.Provider>
  );
}
