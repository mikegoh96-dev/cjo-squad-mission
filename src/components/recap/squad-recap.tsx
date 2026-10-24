"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crown3D } from "@/components/art/objects";
import { AlertIcon, ClockIcon, RefreshIcon, XIcon } from "@/components/icons";
import { RecapPlayer, type ReadyRecap, type RecapContext } from "@/components/recap/recap-player";
import { Card, Decor } from "@/components/ui";
import { type RecapKind, type RecapPeriod, computeRecap, makePeriod, recapPeriods } from "@/lib/recap";
import { RecapLoadError, fetchRecapData } from "@/lib/recap-client";

type Stage =
  | { name: "pick" }
  | { name: "loading"; period: RecapPeriod; slow: boolean }
  | { name: "error"; period: RecapPeriod; kind: "failed" | "unavailable" }
  | { name: "incomplete"; period: RecapPeriod; reason: "history-incomplete" | "too-much-history" }
  | { name: "play"; recap: ReadyRecap };

/** After this long the loading screen says so and offers Cancel more prominently. */
const SLOW_MS = 6000;

/**
 * Mission page "Squad Recap": pick a week or a month, then watch a short
 * animated story of what the squad did together, built only from recorded
 * history (src/lib/recap.ts). Collective only: no rankings or comparisons.
 */
export function SquadRecap({ ctx }: { ctx: RecapContext }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>({ name: "pick" });
  const [kind, setKind] = useState<RecapKind>("week");
  const [openedAt, setOpenedAt] = useState(() => new Date(0));
  const [selected, setSelected] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const slowTimer = useRef(0);

  const periods = open
    ? recapPeriods({ kind, campaign: ctx.campaign, months: ctx.targets.map((t) => t.month), now: openedAt })
    : [];
  const period = periods.find((p) => p.key === selected) ?? periods[0] ?? null;

  const stop = () => {
    abort.current?.abort();
    abort.current = null;
    window.clearTimeout(slowTimer.current);
  };
  const close = () => {
    stop();
    setOpen(false);
    setStage({ name: "pick" });
    // Back to where the person was.
    trigger.current?.focus();
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  const start = () => {
    setOpenedAt(new Date());
    setSelected(null);
    setStage({ name: "pick" });
    setOpen(true);
  };

  const generate = (p: RecapPeriod) => {
    stop();
    const controller = new AbortController();
    abort.current = controller;
    setStage({ name: "loading", period: p, slow: false });
    slowTimer.current = window.setTimeout(
      () => setStage((s) => (s.name === "loading" && s.period.key === p.key ? { ...s, slow: true } : s)),
      SLOW_MS,
    );
    const memberIds = ctx.members.map((m) => m.id);
    fetchRecapData({ squadId: ctx.squadId, campaignId: ctx.campaign.id, memberIds }, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        const now = new Date();
        const recap = computeRecap({
          // Rebuilt at fetch time so "in progress" / "completed" is current.
          period: makePeriod(p.kind, p.startDate, p.timeZone, now),
          events: data.events,
          targets: ctx.targets,
          storedTotals: data.storedTotals,
          memberIds,
          now,
        });
        setStage(recap.state === "ready" ? { name: "play", recap } : { name: "incomplete", period: p, reason: recap.reason });
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setStage({ name: "error", period: p, kind: e instanceof RecapLoadError ? e.kind : "failed" });
      })
      .finally(() => window.clearTimeout(slowTimer.current));
  };

  // Modal behaviour: lock page scroll, trap focus, Escape closes.
  useEffect(() => {
    if (!open) return;
    const el = overlay.current;
    if (!el) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      [...el.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [href]")].filter(
        (f) => f.offsetParent !== null || f === document.activeElement,
      );
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, stage.name]);

  // Never leave a request running after the page goes away.
  useEffect(
    () => () => {
      abort.current?.abort();
      window.clearTimeout(slowTimer.current);
    },
    [],
  );

  return (
    <>
      <Card className="animate-rise relative isolate [animation-delay:100ms]" aria-labelledby="recap-title" data-testid="recap-card">
        <Decor radius="card">
          <span className="absolute -top-16 -right-14 size-52 rounded-full bg-[radial-gradient(circle,var(--violet-soft),transparent_70%)]" />
        </Decor>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="recap-title" className="text-[20px] leading-tight font-extrabold">
              Squad Recap
            </h2>
            <p className="mt-1 text-[15px] text-muted">Relive our squad&apos;s progress and celebrate the milestones.</p>
          </div>
          <Crown3D className="-mt-1 size-14 shrink-0" />
        </div>
        <button
          ref={trigger}
          type="button"
          onClick={start}
          aria-haspopup="dialog"
          data-testid="recap-generate"
          className="btn-3d btn-3d-brand mt-4 flex h-12 w-full items-center justify-center rounded-btn text-[16px] font-extrabold"
        >
          Generate Recap
        </button>
      </Card>

      {open
        ? createPortal(
            <div
              ref={overlay}
              className={`fixed inset-0 z-50 flex justify-center ${
                stage.name === "play" ? "" : "items-end bg-[rgba(10,14,40,0.55)] min-[480px]:items-center"
              }`}
              data-testid="recap-overlay"
              onClick={(e) => {
                if (e.target === e.currentTarget && stage.name !== "play") close();
              }}
            >
              {stage.name === "play" ? (
                <div role="dialog" aria-modal="true" aria-label="Squad recap" className="h-dvh w-full">
                  <RecapPlayer recap={stage.recap} ctx={ctx} onClose={close} />
                </div>
              ) : (
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="recap-dialog-title"
                  className="animate-rise max-h-dvh w-full max-w-md overflow-y-auto rounded-t-card bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-card min-[480px]:rounded-card"
                  data-testid="recap-dialog"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 id="recap-dialog-title" className="pt-1 text-[22px] leading-tight font-extrabold">
                      {stage.name === "pick" ? "Generate a recap" : stage.period.title}
                    </h2>
                    <button
                      type="button"
                      onClick={close}
                      aria-label="Close"
                      className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2"
                    >
                      <XIcon className="size-5" />
                    </button>
                  </div>

                  {stage.name === "pick" ? (
                    <Picker
                      kind={kind}
                      onKind={(k) => {
                        setKind(k);
                        setSelected(null);
                      }}
                      periods={periods}
                      period={period}
                      onSelect={setSelected}
                      campaignStartsOn={ctx.campaign.startsOn}
                      onGenerate={() => period && generate(period)}
                      onCancel={close}
                    />
                  ) : stage.name === "loading" ? (
                    <div className="py-6 text-center" role="status" data-testid="recap-loading">
                      <span className="mx-auto block size-10 animate-spin rounded-full border-4 border-accent-track border-t-accent motion-reduce:animate-none" />
                      <p className="mt-4 text-[16px] font-bold">Gathering our squad&apos;s story…</p>
                      <p className="mt-1 text-[14px] text-muted">{stage.period.rangeLabel}</p>
                      {stage.slow ? (
                        <p className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-warning-text" data-testid="recap-slow">
                          <ClockIcon className="size-4" />
                          This is taking longer than usual.
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          stop();
                          setStage({ name: "pick" });
                        }}
                        className="btn-3d btn-3d-soft mt-5 flex h-12 w-full items-center justify-center rounded-btn text-[15px] font-bold"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <Problem
                      stage={stage}
                      onRetry={stage.name === "error" && stage.kind === "failed" ? () => generate(stage.period) : undefined}
                      onBack={() => setStage({ name: "pick" })}
                    />
                  )}
                </div>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function Picker({
  kind,
  onKind,
  periods,
  period,
  onSelect,
  campaignStartsOn,
  onGenerate,
  onCancel,
}: {
  kind: RecapKind;
  onKind: (k: RecapKind) => void;
  periods: RecapPeriod[];
  period: RecapPeriod | null;
  onSelect: (key: string) => void;
  campaignStartsOn: string;
  onGenerate: () => void;
  onCancel: () => void;
}) {
  const startLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${campaignStartsOn}T00:00:00Z`),
  );
  return (
    <div className="mt-3" data-testid="recap-picker">
      <fieldset>
        <legend className="sr-only">Recap type</legend>
        <div className="grid grid-cols-2 gap-1 rounded-btn bg-surface-2 p-1">
          {(
            [
              ["week", "Weekly Recap"],
              ["month", "Monthly Recap"],
            ] as const
          ).map(([k, label]) => (
            <label
              key={k}
              className={`flex h-11 cursor-pointer items-center justify-center rounded-[12px] text-[15px] font-bold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                kind === k ? "bg-surface text-foreground shadow-tile" : "text-muted"
              }`}
            >
              <input
                type="radio"
                name="recap-kind"
                value={k}
                checked={kind === k}
                onChange={() => onKind(k)}
                className="sr-only"
                data-testid={`recap-kind-${k}`}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {periods.length ? (
        <fieldset className="mt-4">
          <legend className="px-1 text-[13px] font-bold text-muted">Period</legend>
          <div className="mt-2 flex flex-col gap-2">
            {periods.map((p) => {
              const checked = p.key === period?.key;
              return (
                <label
                  key={p.key}
                  className={`flex cursor-pointer items-center gap-3 rounded-tile p-3.5 ring-2 transition-colors has-[:focus-visible]:ring-accent ${
                    checked ? "bg-accent-soft ring-accent/60" : "bg-surface-2 ring-transparent"
                  }`}
                  data-testid={`recap-period-${p.key}`}
                >
                  <input
                    type="radio"
                    name="recap-period"
                    value={p.key}
                    checked={checked}
                    onChange={() => onSelect(p.key)}
                    className="size-5 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-extrabold">{p.title}</span>
                    <span className="block text-[14px] text-muted">{p.rangeLabel}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase ${
                      p.status === "in-progress" ? "bg-flame-soft text-flame-text" : "bg-surface text-muted"
                    }`}
                  >
                    {p.status === "in-progress" ? "In progress" : "Completed"}
                  </span>
                </label>
              );
            })}
          </div>
          {period ? (
            <p className="mt-3 px-1 text-[13px] text-muted" data-testid="recap-bounds">
              <span className="font-bold">Exact period:</span> {period.boundsLabel}
            </p>
          ) : null}
        </fieldset>
      ) : (
        <p className="mt-4 rounded-tile bg-surface-2 p-4 text-[15px]" data-testid="recap-none">
          Recaps open when the campaign starts on {startLabel}.
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="btn-3d btn-3d-soft flex h-12 items-center justify-center rounded-btn text-[15px] font-bold"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onGenerate}
          disabled={!period}
          data-testid="recap-start"
          className="btn-3d btn-3d-brand flex h-12 items-center justify-center rounded-btn text-[16px] font-extrabold disabled:opacity-50"
        >
          Generate
        </button>
      </div>
    </div>
  );
}

function Problem({
  stage,
  onRetry,
  onBack,
}: {
  stage: Extract<Stage, { name: "error" | "incomplete" }>;
  onRetry?: () => void;
  onBack: () => void;
}) {
  const [title, body] =
    stage.name === "error"
      ? stage.kind === "unavailable"
        ? ["Recap isn't available yet", "The squad's history isn't connected to recaps yet. Everything else works as usual."]
        : ["Couldn't load the recap", "Check your connection and try again."]
      : stage.reason === "history-incomplete"
        ? [
            "Not enough history for this period",
            "Some changes in this period weren't recorded, so we can't build an accurate recap. Try another period.",
          ]
        : ["Too much history to recap", "This period has more updates than a recap can read at once."];
  return (
    <div className="mt-2" role="alert" data-testid={`recap-problem-${stage.name === "error" ? stage.kind : stage.reason}`}>
      <div className="flex items-start gap-3 rounded-tile bg-warning-soft p-4">
        <AlertIcon className="mt-0.5 size-5 shrink-0 text-warning-text" />
        <div>
          <p className="text-[16px] font-extrabold">{title}</p>
          <p className="mt-1 text-[14px] text-muted">{body}</p>
        </div>
      </div>
      <div className={`mt-5 grid gap-3 ${onRetry ? "grid-cols-2" : "grid-cols-1"}`}>
        <button
          type="button"
          onClick={onBack}
          className="btn-3d btn-3d-soft flex h-12 items-center justify-center rounded-btn text-[15px] font-bold"
        >
          Back
        </button>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            data-testid="recap-retry"
            className="btn-3d btn-3d-brand flex h-12 items-center justify-center gap-2 rounded-btn text-[16px] font-extrabold"
          >
            <RefreshIcon className="size-4" />
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
