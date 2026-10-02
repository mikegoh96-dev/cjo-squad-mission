"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { AlertIcon, CheckIcon, ChevronLeftIcon, MinusIcon, PlusIcon, RefreshIcon } from "@/components/icons";
import { Card, Meter } from "@/components/ui";
import { missionProgress, pluralCases, remainingMessage } from "@/lib/mission";
import { MAX_CASE_COUNT, parseCaseCount } from "@/lib/validation/case-count";
import { type SaveResult, forgetDevice, saveCaseCount } from "./actions";

type Squad = { total: number; target: number } | null;

type View =
  | { kind: "editing" }
  | { kind: "done"; result: Extract<SaveResult, { status: "saved" | "unchanged" }> }
  | { kind: "conflict"; currentCount: number; attempted: number }
  | { kind: "error"; message: string; fatal: boolean }
  | { kind: "offline"; attempted: number; expected: number };

export function UpdateScreen({
  token,
  memberName,
  squadName,
  monthLabel,
  initialCount,
  squad: initialSquad,
}: {
  token: string | null; // null: use this device's remembered link
  memberName: string;
  squadName: string;
  monthLabel: string;
  initialCount: number;
  squad: Squad;
}) {
  const [current, setCurrent] = useState(initialCount);
  const [draft, setDraft] = useState(String(initialCount));
  const [squad, setSquad] = useState<Squad>(initialSquad);
  const [view, setView] = useState<View>({ kind: "editing" });
  const [pending, startTransition] = useTransition();

  const parsed = parseCaseCount(draft);
  const next = parsed.ok ? parsed.value : null;
  const delta = next === null ? null : next - current;
  const invalid = !parsed.ok && draft !== "";

  const step = (by: number) => {
    const base = next ?? current;
    setDraft(String(Math.min(MAX_CASE_COUNT, Math.max(0, base + by))));
    if (view.kind === "error" && !view.fatal) setView({ kind: "editing" });
  };

  const submit = (value: number, expected: number) => {
    startTransition(async () => {
      let result: SaveResult;
      try {
        result = await saveCaseCount({ token, caseCount: value, expectedCount: expected });
      } catch {
        setView({ kind: "offline", attempted: value, expected });
        return;
      }
      if (result.status === "saved" || result.status === "unchanged") {
        setCurrent(result.caseCount);
        setDraft(String(result.caseCount));
        if (result.squad) setSquad(result.squad);
        setView({ kind: "done", result });
      } else if (result.status === "conflict") {
        setView({ kind: "conflict", currentCount: result.currentCount, attempted: value });
      } else if (result.status === "error") {
        const fatal = result.reason === "invalid-link" || result.reason === "no-open-month";
        setView({ kind: "error", message: result.message, fatal });
      }
    });
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-[max(16px,env(safe-area-inset-top))] pb-10">
      <nav className="animate-rise">
        <Link href="/" className="-ml-2 inline-flex h-11 items-center gap-1 rounded-full px-2 text-[16px] font-medium text-accent">
          <ChevronLeftIcon className="size-5" />
          Squad progress
        </Link>
      </nav>

      <header className="animate-rise px-1">
        <p className="text-[13px] font-semibold tracking-[0.08em] text-accent uppercase">{squadName}</p>
        <h1 className="mt-1 text-[34px] leading-tight font-bold tracking-tight uppercase" data-testid="member-name">
          {memberName}
        </h1>
      </header>

      {view.kind === "done" ? (
        <SuccessCard
          result={view.result}
          monthLabel={monthLabel}
          squad={squad}
          onEditAgain={() => setView({ kind: "editing" })}
        />
      ) : view.kind === "error" && view.fatal ? (
        <Card className="animate-rise text-center" role="alert" data-testid="update-error">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-warning-soft text-warning-text">
            <AlertIcon className="size-7" />
          </span>
          <p className="mt-4 text-[16px] font-medium">{view.message}</p>
          <Link href="/" className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-surface-2 text-[16px] font-semibold">
            Back to squad progress
          </Link>
        </Card>
      ) : (
        <>
          <Card className="animate-rise" aria-labelledby="update-title">
            <h2 id="update-title" className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">
              {monthLabel} cases
            </h2>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-surface-2 p-4">
                <p className="text-[13px] font-medium text-muted">Current</p>
                <p className="mt-1 text-[40px] leading-none font-semibold text-muted" data-testid="current-count">
                  {current}
                </p>
              </div>
              <div className="rounded-2xl bg-accent-soft p-4">
                <p className="text-[13px] font-medium text-accent-strong">New</p>
                <p className="mt-1 text-[40px] leading-none font-semibold text-accent-strong" data-testid="new-count">
                  {next ?? "–"}
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                aria-label="Decrease by one"
                onClick={() => step(-1)}
                disabled={pending || (next ?? current) <= 0}
                className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-surface-2 transition-transform active:scale-95 disabled:opacity-40"
              >
                <MinusIcon className="size-6" />
              </button>
              <label className="sr-only" htmlFor="case-count">
                New {monthLabel} total
              </label>
              <input
                id="case-count"
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="done"
                value={draft}
                disabled={pending}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  setDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 4));
                  if (view.kind !== "editing") setView({ kind: "editing" });
                }}
                className={`h-14 min-w-0 flex-1 rounded-2xl border bg-surface text-center text-[28px] font-semibold outline-none focus:ring-4 ${
                  invalid
                    ? "border-danger-text focus:border-danger-text focus:ring-danger-text/20"
                    : "border-hairline focus:border-accent focus:ring-accent/20"
                }`}
                aria-invalid={invalid}
                aria-describedby="change-summary"
              />
              <button
                type="button"
                aria-label="Increase by one"
                onClick={() => step(1)}
                disabled={pending || (next ?? current) >= MAX_CASE_COUNT}
                className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-surface-2 transition-transform active:scale-95 disabled:opacity-40"
              >
                <PlusIcon className="size-6" />
              </button>
            </div>

            <p
              id="change-summary"
              className={`mt-3 min-h-6 text-center text-[15px] ${invalid ? "font-medium text-danger-text" : "text-muted"}`}
              aria-live="polite"
            >
              {next === null
                ? parsed.ok
                  ? ""
                  : "Enter a whole number from 0 to 1000"
                : delta === 0
                  ? "No change yet. Enter your current total."
                  : delta! > 0
                    ? `+${delta} from your current count`
                    : `${delta} from your current count (correction)`}
            </p>

            {view.kind === "conflict" ? (
              <div className="mt-4 rounded-2xl bg-warning-soft p-4 text-[15px]" role="alert" data-testid="conflict">
                <p className="font-semibold text-warning-text">Your count changed to {view.currentCount}</p>
                <p className="mt-1 text-foreground">
                  It was updated since you opened this page (another device or your squad lead).
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="h-11 rounded-xl bg-surface text-[15px] font-semibold"
                    onClick={() => {
                      setCurrent(view.currentCount);
                      setDraft(String(view.currentCount));
                      setView({ kind: "editing" });
                    }}
                  >
                    Keep {view.currentCount}
                  </button>
                  <button
                    type="button"
                    className="h-11 rounded-xl bg-accent text-[15px] font-semibold text-white"
                    onClick={() => {
                      setCurrent(view.currentCount);
                      submit(view.attempted, view.currentCount);
                    }}
                  >
                    Save {view.attempted} anyway
                  </button>
                </div>
              </div>
            ) : null}

            {view.kind === "error" && !view.fatal ? (
              <p className="mt-4 rounded-2xl bg-danger-soft p-4 text-[15px] text-danger-text" role="alert" data-testid="update-error">
                {view.message}
              </p>
            ) : null}

            {view.kind === "offline" ? (
              <div className="mt-4 rounded-2xl bg-danger-soft p-4 text-[15px]" role="alert" data-testid="offline">
                <p className="font-semibold text-danger-text">Couldn&apos;t reach the server</p>
                <p className="mt-1">Check your connection. Nothing was lost, your number is still here.</p>
                <button
                  type="button"
                  onClick={() => submit(view.attempted, view.expected)}
                  className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-surface px-4 text-[15px] font-semibold"
                >
                  <RefreshIcon className="size-4" />
                  Try again
                </button>
              </div>
            ) : null}

            <button
              type="button"
              data-testid="save"
              disabled={pending || next === null || delta === 0}
              onClick={() => next !== null && submit(next, current)}
              className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[17px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(42,120,214,0.6)] transition-transform active:scale-[0.98] disabled:bg-accent-track disabled:text-accent-strong disabled:shadow-none"
            >
              {pending ? (
                <>
                  <RefreshIcon className="size-5 animate-spin" />
                  Saving…
                </>
              ) : next !== null && delta !== 0 ? (
                `Save ${pluralCases(next)}`
              ) : (
                "Save"
              )}
            </button>
          </Card>

          {squad ? <SquadContext monthLabel={monthLabel} squad={squad} /> : null}
        </>
      )}

      <form action={forgetDevice} className="mt-auto pt-6 text-center">
        <button type="submit" className="text-[13px] text-muted underline underline-offset-4">
          Not {memberName}? Forget this device
        </button>
      </form>
    </main>
  );
}

function SquadContext({ monthLabel, squad }: { monthLabel: string; squad: NonNullable<Squad> }) {
  const p = missionProgress(squad.total, squad.target);
  return (
    <Card className="animate-rise [animation-delay:80ms]" data-testid="squad-context">
      <div className="flex items-baseline justify-between">
        <p className="text-[15px] font-semibold">Squad {monthLabel}</p>
        <p className="text-[15px] font-semibold">
          {p.total} / {p.target}
        </p>
      </div>
      <div className="mt-3">
        <Meter size="sm" value={p.meterPercent} complete={p.complete} label={`Squad ${monthLabel} progress`} />
      </div>
      <p className="mt-2 text-[13px] text-muted">{remainingMessage(p, monthLabel)}</p>
    </Card>
  );
}

function SuccessCard({
  result,
  monthLabel,
  squad,
  onEditAgain,
}: {
  result: Extract<SaveResult, { status: "saved" | "unchanged" }>;
  monthLabel: string;
  squad: Squad;
  onEditAgain: () => void;
}) {
  const squadProgress = squad ? missionProgress(squad.total, squad.target) : null;
  return (
    <Card className="animate-rise text-center" role="status" data-testid="success">
      <span className="animate-pop mx-auto flex size-16 items-center justify-center rounded-full bg-good text-white">
        <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path className="animate-draw" d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <h2 className="mt-4 text-2xl font-semibold">{result.status === "saved" ? "Saved" : "Already up to date"}</h2>
      <p className="mt-1 text-[16px] text-muted" data-testid="success-message">
        You&apos;re at {pluralCases(result.caseCount)} for {monthLabel}
      </p>

      {squadProgress ? (
        <div className="mt-6 rounded-2xl bg-surface-2 p-4 text-left">
          <div className="flex items-baseline justify-between">
            <p className="text-[15px] font-semibold">Squad {monthLabel}</p>
            <p className="text-[15px] font-semibold" data-testid="success-squad-total">
              <AnimatedNumber value={squadProgress.total} /> / {squadProgress.target}
            </p>
          </div>
          <div className="mt-3">
            <Meter value={squadProgress.meterPercent} complete={squadProgress.complete} label={`Squad ${monthLabel} progress`} />
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[14px] font-medium">
            {squadProgress.complete ? <CheckIcon className="size-4 text-good-text" /> : null}
            {squadProgress.complete ? "Mission complete. Together." : remainingMessage(squadProgress, monthLabel)}
          </p>
        </div>
      ) : null}

      <Link
        href="/"
        className="mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-accent text-[17px] font-semibold text-white transition-transform active:scale-[0.98]"
        data-testid="see-squad"
      >
        See squad progress
      </Link>
      <button type="button" onClick={onEditAgain} className="mt-3 h-12 w-full rounded-2xl bg-surface-2 text-[16px] font-semibold">
        Edit again
      </button>
    </Card>
  );
}
