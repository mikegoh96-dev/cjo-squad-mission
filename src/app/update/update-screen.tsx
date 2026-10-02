"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import {
  AlertIcon,
  CheckIcon,
  ClockIcon,
  LockIcon,
  MinusIcon,
  PlusIcon,
  RefreshIcon,
  SwapIcon,
} from "@/components/icons";
import { Celebration } from "@/components/mission/celebration";
import { Avatar, Card, Eyebrow, Meter } from "@/components/ui";
import type { RecentUpdate } from "@/lib/data/case-updates";
import { missionProgress, pluralCases, relativeTime, remainingMessage } from "@/lib/mission";
import { MAX_CASE_COUNT, parseCaseCount } from "@/lib/validation/case-count";
import { type SaveResult, saveCaseCount, switchMember } from "./actions";

type Squad = { total: number; target: number };
type Done = Extract<SaveResult, { status: "saved" | "unchanged" }>;

type View =
  | { kind: "editing" }
  | { kind: "done"; result: Done }
  | { kind: "conflict"; currentCount: number; attempted: number }
  | { kind: "error"; message: string; fatal: boolean }
  | { kind: "offline"; attempted: number; expected: number };

const QUICK_STEPS = [1, 2, 5] as const;

export function UpdateScreen({
  member,
  squadName,
  month,
  initialCount,
  squad: initialSquad,
  otherMonths,
  recent: initialRecent,
}: {
  member: { id: string; name: string; initials: string };
  squadName: string;
  month: { key: string; label: string };
  initialCount: number;
  squad: Squad;
  otherMonths: Array<{ key: string; label: string; phase: "past" | "current" | "upcoming" }>;
  recent: RecentUpdate[] | null; // null: couldn't load
}) {
  const [current, setCurrent] = useState(initialCount);
  const [draft, setDraft] = useState(String(initialCount));
  const [squad, setSquad] = useState<Squad>(initialSquad);
  const [recent, setRecent] = useState(initialRecent);
  const [view, setView] = useState<View>({ kind: "editing" });
  const [pending, startTransition] = useTransition();

  const parsed = parseCaseCount(draft);
  const next = parsed.ok ? parsed.value : null;
  const delta = next === null ? null : next - current;
  const invalid = !parsed.ok && draft !== "";

  const step = (by: number) => {
    const base = next ?? current;
    setDraft(String(Math.min(MAX_CASE_COUNT, Math.max(0, base + by))));
    if (view.kind !== "editing") setView({ kind: "editing" });
  };

  const submit = (value: number, expected: number) => {
    startTransition(async () => {
      let result: SaveResult;
      try {
        result = await saveCaseCount({ squadMemberId: member.id, caseCount: value, expectedCount: expected });
      } catch {
        setView({ kind: "offline", attempted: value, expected });
        return;
      }
      if (result.status === "saved" || result.status === "unchanged") {
        setCurrent(result.caseCount);
        setDraft(String(result.caseCount));
        if (result.squad) setSquad(result.squad);
        setRecent(result.recent);
        setView({ kind: "done", result });
      } else if (result.status === "conflict") {
        setView({ kind: "conflict", currentCount: result.currentCount, attempted: value });
      } else if (result.status === "error") {
        const fatal = result.reason === "unknown-member" || result.reason === "no-open-month";
        setView({ kind: "error", message: result.message, fatal });
      }
    });
  };

  return (
    <>
      <Card className="animate-rise flex items-center gap-3 !p-4" aria-label="Updating for">
        <Avatar name={member.name} id={member.id} initials={member.initials} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[19px] font-extrabold" data-testid="member-name">
            {member.name}
          </p>
          <p className="truncate text-[13px] text-muted">{squadName}</p>
        </div>
        <form action={switchMember}>
          <button
            type="submit"
            data-testid="switch-member"
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface-2 px-3.5 text-[13px] font-semibold text-accent-strong"
          >
            <SwapIcon className="size-4" />
            Not you?
          </button>
        </form>
      </Card>

      {view.kind === "done" ? (
        <SuccessCard
          result={view.result}
          monthLabel={month.label}
          squad={squad}
          onEditAgain={() => setView({ kind: "editing" })}
        />
      ) : view.kind === "error" && view.fatal ? (
        <Card className="animate-rise text-center" role="alert" data-testid="update-error">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-warning-soft text-warning-text">
            <AlertIcon className="size-7" />
          </span>
          <p className="mt-4 text-[16px] font-semibold">{view.message}</p>
          <Link
            href="/update"
            className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-surface-2 text-[16px] font-semibold"
          >
            Pick your name again
          </Link>
        </Card>
      ) : (
        <Card className="animate-rise [animation-delay:60ms]" aria-labelledby="update-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="update-title" className="text-[17px] font-extrabold">
              {month.label} cases
            </h2>
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold tracking-wide text-accent-strong uppercase">
              This month
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-surface-2 p-4">
              <p className="text-[13px] font-semibold text-muted">Current</p>
              <p className="mt-1 text-[40px] leading-none font-extrabold text-muted tabular-nums" data-testid="current-count">
                {current}
              </p>
            </div>
            <div className="rounded-2xl bg-accent-soft p-4">
              <p className="text-[13px] font-semibold text-accent-strong">New total</p>
              <p className="mt-1 text-[40px] leading-none font-extrabold text-accent-strong tabular-nums" data-testid="new-count">
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
              New {month.label} total
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
              className={`h-14 min-w-0 flex-1 rounded-2xl border-2 bg-surface text-center text-[28px] font-extrabold tabular-nums outline-none focus:ring-4 ${
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

          <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Quick add">
            {QUICK_STEPS.map((n) => (
              <button
                key={n}
                type="button"
                data-testid={`quick-${n}`}
                onClick={() => step(n)}
                disabled={pending || (next ?? current) >= MAX_CASE_COUNT}
                className="h-11 rounded-xl bg-violet-soft text-[15px] font-bold text-violet transition-transform active:scale-95 disabled:opacity-40"
              >
                +{n}
              </button>
            ))}
          </div>

          <p
            id="change-summary"
            className={`mt-3 min-h-6 text-center text-[15px] ${invalid ? "font-semibold text-danger-text" : "text-muted"}`}
            aria-live="polite"
          >
            {next === null
              ? parsed.ok
                ? ""
                : "Enter a whole number from 0 to 1000"
              : delta === 0
                ? "Enter your new total for the month."
                : delta! > 0
                  ? `+${delta} from your current total`
                  : `${delta} from your current total (correction)`}
          </p>

          {view.kind === "conflict" ? (
            <div className="mt-4 rounded-2xl bg-warning-soft p-4 text-[15px]" role="alert" data-testid="conflict">
              <p className="font-bold text-warning-text">
                {member.name}&apos;s count changed to {view.currentCount}
              </p>
              <p className="mt-1 text-foreground">Someone updated it since you opened this page.</p>
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
              <p className="font-bold text-danger-text">Couldn&apos;t reach the server</p>
              <p className="mt-1">Check your connection. Nothing was lost; your number is still here.</p>
            </div>
          ) : null}

          <button
            type="button"
            data-testid="save"
            disabled={pending || next === null || (delta === 0 && view.kind !== "offline")}
            onClick={() => {
              if (view.kind === "offline") submit(view.attempted, view.expected);
              else if (next !== null) submit(next, current);
            }}
            className="bg-brand mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[17px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(61,95,224,0.8)] transition-transform active:scale-[0.98] disabled:bg-none disabled:bg-accent-track disabled:text-accent-strong disabled:shadow-none"
          >
            {pending ? (
              <>
                <RefreshIcon className="size-5 animate-spin" />
                Saving…
              </>
            ) : view.kind === "offline" ? (
              <>
                <RefreshIcon className="size-5" />
                Try again
              </>
            ) : next !== null && delta !== 0 ? (
              `Save ${pluralCases(next)}`
            ) : (
              "Save update"
            )}
          </button>

          {otherMonths.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2" aria-label="Other months">
              {otherMonths.map((m) => (
                <li
                  key={m.key}
                  data-testid={`locked-${m.key}`}
                  className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 text-[14px] text-muted"
                >
                  <span className="font-semibold">{m.label}</span>
                  <span className="inline-flex items-center gap-1.5">
                    <LockIcon className="size-3.5" />
                    {m.phase === "upcoming" ? `Opens 1 ${m.label}` : "Closed"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      )}

      {view.kind !== "done" ? <SquadContext monthLabel={month.label} squad={squad} /> : null}
      <RecentUpdates recent={recent} name={member.name} />
    </>
  );
}

function SquadContext({ monthLabel, squad }: { monthLabel: string; squad: Squad }) {
  const p = missionProgress(squad.total, squad.target);
  return (
    <Card className="animate-rise [animation-delay:120ms]" data-testid="squad-context">
      <div className="flex items-baseline justify-between">
        <p className="text-[15px] font-bold">Squad {monthLabel}</p>
        <p className="text-[15px] font-bold tabular-nums">
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

function RecentUpdates({ recent, name }: { recent: RecentUpdate[] | null; name: string }) {
  return (
    <Card className="animate-rise [animation-delay:160ms]" aria-labelledby="recent-title" data-testid="recent-updates">
      <Eyebrow>
        <span id="recent-title">Recent updates for {name}</span>
      </Eyebrow>
      {recent === null ? (
        <p className="mt-3 text-[14px] text-muted">Couldn&apos;t load recent updates.</p>
      ) : recent.length === 0 ? (
        <p className="mt-3 text-[14px] text-muted">No updates yet. Your first one will show here.</p>
      ) : (
        <ul className="mt-2 divide-y divide-hairline">
          {recent.map((r) => (
            <li key={`${r.changedAt}-${r.oldCount}-${r.newCount}`} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-[15px] font-semibold tabular-nums">
                {new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(`${r.month}T00:00:00Z`))}
                {": "}
                {r.oldCount} → {r.newCount}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-[13px] text-muted">
                <ClockIcon className="size-3.5" />
                {relativeTime(new Date(r.changedAt))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SuccessCard({
  result,
  monthLabel,
  squad,
  onEditAgain,
}: {
  result: Done;
  monthLabel: string;
  squad: Squad;
  onEditAgain: () => void;
}) {
  const p = missionProgress(squad.total, squad.target);
  return (
    <Card className="animate-rise text-center" role="status" data-testid="success">
      <span className="animate-pop mx-auto flex size-16 items-center justify-center rounded-full bg-good text-white">
        <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path className="animate-draw" d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <h2 className="mt-4 text-2xl font-extrabold">{result.status === "saved" ? "Saved. Thank you!" : "Already up to date"}</h2>
      <p className="mt-1 text-[16px] text-muted" data-testid="success-message">
        {pluralCases(result.caseCount)} for {monthLabel}
      </p>

      <div className="mt-6 rounded-2xl bg-surface-2 p-4 text-left">
        <div className="flex items-baseline justify-between">
          <p className="text-[15px] font-bold">Squad {monthLabel}</p>
          <p className="text-[15px] font-bold tabular-nums" data-testid="success-squad-total">
            <AnimatedNumber value={p.total} /> / {p.target}
          </p>
        </div>
        <div className="mt-3">
          <Meter value={p.meterPercent} complete={p.complete} label={`Squad ${monthLabel} progress`} />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[14px] font-semibold">
          {p.complete ? <CheckIcon className="size-4 text-good-text" /> : null}
          {p.complete ? `${monthLabel} cleared. Together.` : remainingMessage(p, monthLabel)}
        </p>
      </div>

      <Link
        href="/"
        className="bg-brand mt-6 flex h-14 w-full items-center justify-center rounded-2xl text-[17px] font-bold text-white transition-transform active:scale-[0.98]"
        data-testid="see-squad"
      >
        See squad progress
      </Link>
      <button type="button" onClick={onEditAgain} className="mt-3 h-12 w-full rounded-2xl bg-surface-2 text-[16px] font-semibold">
        Edit again
      </button>

      {result.milestone ? (
        <Celebration
          title={`${result.milestone.label}!`}
          message={`The squad passed ${pluralCases(result.milestone.cases)} in ${monthLabel}.`}
          cases={result.milestone.cases}
        />
      ) : null}
    </Card>
  );
}
