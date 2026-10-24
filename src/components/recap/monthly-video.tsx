"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trophy3D } from "@/components/art/objects";
import {
  AlertIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  ReplayIcon,
  ShareIcon,
  XIcon,
} from "@/components/icons";
import type { RecapContext } from "@/components/recap/recap-player";
import { Card, Decor } from "@/components/ui";
import { computeRecap, makePeriod, recapPeriods } from "@/lib/recap";
import { RecapLoadError, fetchRecapData } from "@/lib/recap-client";
import { VIDEO, VIDEO_DURATION_MS, VIDEO_SCENES, type VideoReport, buildVideoReport, sceneStart } from "@/lib/recap-video";

type Composition = typeof import("./video/composition");
type Encoder = typeof import("./video/encode");
type Assets = Awaited<ReturnType<Composition["loadVideoAssets"]>>;

type MonthOption = { month: string; label: string; status: "in-progress" | "completed"; report: VideoReport | null };
type Made = { blob: Blob; url: string; name: string; kind: "mp4" | "png" };
type Step =
  | { name: "loading" }
  | { name: "error"; kind: "failed" | "unavailable" }
  | { name: "preview" }
  | { name: "rendering"; share: number }
  | { name: "done"; made: Made }
  | { name: "render-error"; message: string };

const PREVIEW_SCALE = 0.5;
/** A scene's "settled" moment, for the still preview under reduced motion. */
const settled = (i: number) => sceneStart(i) + (i === VIDEO_SCENES.length - 1 ? VIDEO_SCENES[i].ms - 1 : VIDEO_SCENES[i].ms - 400);
const fmtMB = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/**
 * Mission page: download this month's recap as a vertical video for Instagram
 * Stories. Everything is made on this device from the same recap numbers as
 * the Squad Recap (no server rendering, nothing uploaded). Browsers that can't
 * encode H.264 get a PNG of the closing frame instead, clearly labelled.
 */
export function MonthlyVideo({ ctx }: { ctx: RecapContext }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ name: "loading" });
  const [options, setOptions] = useState<MonthOption[]>([]);
  const [month, setMonth] = useState<string | null>(null);
  const [mp4, setMp4] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(true);
  const [still, setStill] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const assets = useRef<Assets | null>(null);
  const comp = useRef<Composition | null>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const madeUrl = useRef<string | null>(null);
  /** Where the playing preview is (ms), so Pause freezes on the current frame. */
  const previewAt = useRef(0);

  const report = options.find((o) => o.month === month)?.report ?? null;

  const release = () => {
    abort.current?.abort();
    abort.current = null;
    busy.current = false;
    if (madeUrl.current) URL.revokeObjectURL(madeUrl.current);
    madeUrl.current = null;
  };
  const close = () => {
    release();
    setOpen(false);
    trigger.current?.focus();
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  const load = () => {
    setStep({ name: "loading" });
    setNote(null);
    const memberIds = ctx.members.map((m) => m.id);
    const controller = new AbortController();
    abort.current = controller;
    Promise.all([
      fetchRecapData({ squadId: ctx.squadId, campaignId: ctx.campaign.id, memberIds }, controller.signal),
      import("./video/composition").then(async (c) => {
        comp.current = c;
        assets.current ??= await c.loadVideoAssets();
      }),
      import("./video/encode").then((e: Encoder) => e.canMakeMp4()),
    ])
      .then(([data, , canMp4]) => {
        if (controller.signal.aborted) return;
        // One snapshot per month, taken now: the preview and the file both use it.
        const now = new Date();
        const months = recapPeriods({ kind: "month", campaign: ctx.campaign, months: ctx.targets.map((t) => t.month), now });
        const list = months.map((p) => {
          const recap = computeRecap({
            period: makePeriod("month", p.startDate, p.timeZone, now),
            events: data.events,
            targets: ctx.targets,
            storedTotals: data.storedTotals,
            memberIds,
            now,
          });
          return {
            month: p.startDate,
            label: `${p.title} ${p.startDate.slice(0, 4)}`,
            status: p.status,
            report: buildVideoReport(recap, ctx.campaign.name),
          };
        });
        setOptions(list);
        setMonth(list.find((o) => o.report)?.month ?? null);
        setMp4(canMp4);
        setStill(0);
        setStep({ name: "preview" });
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setStep({ name: "error", kind: e instanceof RecapLoadError && e.kind === "unavailable" ? "unavailable" : "failed" });
      });
  };

  const start = () => {
    previewAt.current = 0;
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setOpen(true);
    load();
  };

  const generate = async () => {
    if (!report || busy.current || !assets.current) return; // one job at a time
    busy.current = true;
    setNote(null);
    setPlaying(false);
    const controller = new AbortController();
    abort.current = controller;
    const enc = await import("./video/encode");
    try {
      let made: Made;
      if (mp4) {
        setStep({ name: "rendering", share: 0 });
        let last = 0;
        const blob = await enc.renderMp4(report, assets.current, {
          signal: controller.signal,
          onProgress: (share) => {
            // Repaint about 50 times over the job, not on every frame.
            if (share - last >= 0.02 || share === 1) {
              last = share;
              setStep({ name: "rendering", share });
            }
          },
        });
        made = { blob, url: URL.createObjectURL(blob), name: `${report.fileBase}.mp4`, kind: "mp4" };
      } else {
        const blob = await enc.renderStillPng(report, assets.current);
        made = { blob, url: URL.createObjectURL(blob), name: `${report.fileBase}.png`, kind: "png" };
      }
      if (controller.signal.aborted) {
        URL.revokeObjectURL(made.url);
        return;
      }
      if (madeUrl.current) URL.revokeObjectURL(madeUrl.current);
      madeUrl.current = made.url;
      setStep({ name: "done", made });
    } catch (e) {
      if (controller.signal.aborted || e instanceof enc.VideoCanceledError) {
        if (abort.current === controller || abort.current === null) setStep({ name: "preview" });
      } else {
        setStep({
          name: "render-error",
          message:
            e instanceof enc.VideoUnsupportedError
              ? "This browser can't create videos."
              : "Something went wrong while creating the video.",
        });
      }
    } finally {
      busy.current = false;
      if (abort.current === controller) abort.current = null;
    }
  };

  const cancel = () => {
    abort.current?.abort();
    abort.current = null;
    busy.current = false;
    setStep({ name: "preview" });
  };

  const share = async (made: Made) => {
    const file = new File([made.blob], made.name, { type: made.blob.type });
    try {
      await navigator.share({ files: [file], title: "CJO Squad Recap" });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setNote("Sharing didn't work here. Download the file, then post it from your gallery.");
    }
  };

  // Preview: the composition itself, playing (or one still per scene under reduced motion).
  useEffect(() => {
    const canvas = preview.current;
    const c = comp.current;
    const a = assets.current;
    if (!open || step.name !== "preview" || !canvas || !c || !a || !report) return;
    const g = canvas.getContext("2d", { alpha: false });
    if (!g) return;
    g.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
    if (reduced || !playing) {
      c.drawFrame(g, report, a, reduced ? settled(still) : Math.min(previewAt.current, VIDEO_DURATION_MS - 1));
      return;
    }
    let frame = 0;
    let begin = performance.now() - previewAt.current;
    let lastDraw = 0;
    const tick = (now: number) => {
      if (now - lastDraw >= 1000 / VIDEO.fps - 1) {
        lastDraw = now;
        // Hold the last frame for a moment, then loop.
        if (now - begin >= VIDEO_DURATION_MS + 1200) begin = now;
        previewAt.current = now - begin;
        c.drawFrame(g, report, a, Math.min(previewAt.current, VIDEO_DURATION_MS - 1));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [open, step.name, report, playing, reduced, still]);

  // Modal behaviour: lock page scroll, trap focus, Escape closes (not while saving a file).
  useEffect(() => {
    if (!open) return;
    const el = overlay.current;
    if (!el) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      [...el.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href]")].filter(
        (f) => f.offsetParent !== null,
      );
    if (!el.contains(document.activeElement)) (el.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0])?.focus();
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
  }, [open, step.name]);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (madeUrl.current) URL.revokeObjectURL(madeUrl.current);
    },
    [],
  );

  const canShareMade = (made: Made) => {
    try {
      return typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([made.blob], made.name, { type: made.blob.type })] });
    } catch {
      return false;
    }
  };

  return (
    <>
      <Card className="animate-rise relative isolate [animation-delay:120ms]" aria-labelledby="video-title" data-testid="video-card">
        <Decor radius="card">
          <span className="absolute -bottom-16 -left-14 size-52 rounded-full bg-[radial-gradient(circle,var(--accent-soft),transparent_70%)]" />
        </Decor>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold tracking-[0.12em] text-muted uppercase">For Instagram Stories</p>
            <h2 id="video-title" className="mt-1 text-[20px] leading-tight font-extrabold">
              Monthly Recap video
            </h2>
            <p className="mt-1 text-[15px] text-muted">Celebrate the squad&apos;s progress. Download and share this month&apos;s mission.</p>
          </div>
          <Trophy3D className="-mt-1 size-14 shrink-0" />
        </div>
        <button
          ref={trigger}
          type="button"
          onClick={start}
          aria-haspopup="dialog"
          data-testid="video-open"
          className="btn-3d btn-3d-brand mt-4 flex h-12 w-full items-center justify-center rounded-btn text-[16px] font-extrabold"
        >
          Download Monthly Recap
        </button>
      </Card>

      {open
        ? createPortal(
            <div
              ref={overlay}
              className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(10,14,40,0.55)] min-[480px]:items-center"
              data-testid="video-overlay"
              onClick={(e) => {
                if (e.target === e.currentTarget && step.name !== "rendering") close();
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="video-dialog-title"
                className="animate-rise max-h-dvh w-full max-w-md overflow-y-auto rounded-t-card bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-card min-[480px]:rounded-card"
                data-testid="video-dialog"
                data-step={step.name}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 id="video-dialog-title" className="pt-1 text-[22px] leading-tight font-extrabold">
                    Monthly Recap
                  </h2>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close"
                    data-autofocus
                    data-testid="video-close"
                    className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2"
                  >
                    <XIcon className="size-5" />
                  </button>
                </div>

                {step.name === "loading" ? (
                  <div className="py-8 text-center" role="status" data-testid="video-loading">
                    <span className="mx-auto block size-10 animate-spin rounded-full border-4 border-accent-track border-t-accent motion-reduce:animate-none" />
                    <p className="mt-4 text-[16px] font-bold">Getting this month&apos;s numbers…</p>
                  </div>
                ) : step.name === "error" ? (
                  <Problem
                    title={step.kind === "unavailable" ? "Recap isn't available yet" : "Couldn't load the recap"}
                    body={
                      step.kind === "unavailable"
                        ? "The squad's history isn't connected to recaps yet."
                        : "Check your connection and try again."
                    }
                    onRetry={step.kind === "failed" ? load : undefined}
                    onBack={close}
                  />
                ) : (
                  <>
                    <fieldset className="mt-3" disabled={step.name === "rendering"}>
                      <legend className="px-1 text-[13px] font-bold text-muted">Month</legend>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {options.map((o) => (
                          <label
                            key={o.month}
                            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-[15px] font-bold ring-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:ring-accent ${
                              o.month === month ? "bg-accent-soft text-accent-strong ring-accent/60" : "bg-surface-2 ring-transparent"
                            }`}
                            data-testid={`video-month-${o.month}`}
                          >
                            <input
                              type="radio"
                              name="video-month"
                              value={o.month}
                              checked={o.month === month}
                              disabled={!o.report}
                              onChange={() => {
                                setMonth(o.month);
                                setStill(0);
                                previewAt.current = 0;
                                if (step.name !== "preview") setStep({ name: "preview" });
                              }}
                              className="sr-only"
                            />
                            {o.label}
                            {!o.report ? <span className="text-[12px] font-semibold text-muted">· not enough history</span> : null}
                            {o.report && o.status === "in-progress" ? (
                              <span className="text-[12px] font-semibold text-flame-text">· so far</span>
                            ) : null}
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    {!report ? (
                      <p className="mt-4 rounded-tile bg-surface-2 p-4 text-[15px]" data-testid="video-none">
                        {options.length
                          ? "There isn't enough recorded history to make a recap for these months."
                          : "Recaps open when the campaign starts."}
                      </p>
                    ) : step.name === "done" ? (
                      <Done
                        made={step.made}
                        report={report}
                        canShare={canShareMade(step.made)}
                        onShare={() => share(step.made)}
                        onPreview={() => {
                          setPlaying(!reduced);
                          setStep({ name: "preview" });
                        }}
                        onClose={close}
                        note={note}
                      />
                    ) : (
                      <>
                        <div className="mt-4 flex justify-center">
                          <div className="relative">
                            <canvas
                              ref={preview}
                              width={VIDEO.width * PREVIEW_SCALE}
                              height={VIDEO.height * PREVIEW_SCALE}
                              role="img"
                              aria-label={`Preview of the ${report.monthLabel} ${report.year} recap: ${report.total}${
                                report.target !== null ? ` of ${report.target}` : ""
                              } cases${report.percent !== null ? `, ${report.percent}% complete` : ""}`}
                              className={`block h-[min(52dvh,480px)] w-auto rounded-tile bg-[#eef1fb] shadow-tile ${
                                step.name === "rendering" ? "opacity-60" : ""
                              }`}
                              style={{ aspectRatio: "9 / 16" }}
                              data-testid="video-preview"
                            />
                          </div>
                        </div>
                        {step.name === "preview" ? (
                          <div className="mt-3 flex items-center justify-center gap-2">
                            {reduced ? (
                              <>
                                <IconButton label="Previous scene" onClick={() => setStill((s) => Math.max(0, s - 1))} disabled={still === 0}>
                                  <ChevronLeftIcon className="size-5" />
                                </IconButton>
                                <span className="min-w-24 text-center text-[13px] font-bold text-muted" data-testid="video-still">
                                  Scene {still + 1} of {VIDEO_SCENES.length}
                                </span>
                                <IconButton
                                  label="Next scene"
                                  onClick={() => setStill((s) => Math.min(VIDEO_SCENES.length - 1, s + 1))}
                                  disabled={still === VIDEO_SCENES.length - 1}
                                >
                                  <ChevronRightIcon className="size-5" />
                                </IconButton>
                              </>
                            ) : (
                              <>
                                <IconButton label={playing ? "Pause preview" : "Play preview"} onClick={() => setPlaying((p) => !p)} testId="video-play">
                                  {playing ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5" />}
                                </IconButton>
                                <span className="text-[13px] font-bold text-muted">
                                  Preview · {(VIDEO_DURATION_MS / 1000).toFixed(1)} s · 9:16
                                </span>
                              </>
                            )}
                          </div>
                        ) : null}

                        {step.name === "rendering" ? (
                          <div className="mt-4" data-testid="video-rendering">
                            <div className="flex items-baseline justify-between text-[14px] font-bold">
                              <span>Creating your video…</span>
                              <span className="tabular-nums" data-testid="video-progress">
                                {Math.floor(step.share * 100)}%
                              </span>
                            </div>
                            <div
                              role="progressbar"
                              aria-label="Video progress"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.floor(step.share * 100)}
                              className="mt-2 h-3 w-full overflow-hidden rounded-full bg-accent-track"
                            >
                              <div className="h-full rounded-full bg-accent" style={{ width: `${step.share * 100}%` }} />
                            </div>
                            <p className="mt-2 text-[13px] text-muted">Made on this phone. Keep the app open until it&apos;s done.</p>
                            <button
                              type="button"
                              onClick={cancel}
                              data-testid="video-cancel"
                              className="btn-3d btn-3d-soft mt-4 flex h-12 w-full items-center justify-center rounded-btn text-[15px] font-bold"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            {step.name === "render-error" ? (
                              <p className="mt-4 flex items-start gap-2 rounded-tile bg-warning-soft p-3 text-[14px]" role="alert" data-testid="video-render-error">
                                <AlertIcon className="mt-0.5 size-4 shrink-0 text-warning-text" />
                                {step.message} Try again, or save the recap as an image.
                              </p>
                            ) : null}
                            {mp4 === false ? (
                              <p className="mt-4 rounded-tile bg-surface-2 p-3 text-[14px]" data-testid="video-fallback-note">
                                This browser can&apos;t create videos, so you can save the recap as a <strong>PNG image</strong> (the
                                closing frame) instead.
                              </p>
                            ) : null}
                            <button
                              type="button"
                              onClick={generate}
                              data-testid="video-generate"
                              className="btn-3d btn-3d-brand mt-4 flex h-12 w-full items-center justify-center rounded-btn text-[16px] font-extrabold"
                            >
                              {mp4 ? "Generate Video" : "Create image (PNG)"}
                            </button>
                            {mp4 && step.name === "render-error" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setMp4(false);
                                  setStep({ name: "preview" });
                                }}
                                className="btn-3d btn-3d-soft mt-3 flex h-12 w-full items-center justify-center rounded-btn text-[15px] font-bold"
                              >
                                Save as image instead
                              </button>
                            ) : null}
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  testId,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="flex size-11 items-center justify-center rounded-full bg-surface-2 transition-colors hover:bg-accent-soft disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Done({
  made,
  report,
  canShare,
  onShare,
  onPreview,
  onClose,
  note,
}: {
  made: Made;
  report: VideoReport;
  canShare: boolean;
  onShare: () => void;
  onPreview: () => void;
  onClose: () => void;
  note: string | null;
}) {
  const video = made.kind === "mp4";
  return (
    <div className="mt-4" data-testid="video-done" data-kind={made.kind}>
      <div className="rounded-tile bg-good-soft p-4">
        <p className="text-[16px] font-extrabold text-good-text">{video ? "Your video is ready" : "Your image is ready"}</p>
        <p className="mt-1 text-[14px]" data-testid="video-file">
          {made.name} · {video ? "MP4 video" : "PNG image"} · 1080 × 1920
          {video ? ` · ${(VIDEO_DURATION_MS / 1000).toFixed(1)} s` : ""} · {fmtMB(made.blob.size)}
        </p>
        <p className="mt-1 text-[13px] text-muted">
          {report.monthLabel} {report.year} · {report.total}
          {report.target !== null ? ` of ${report.target}` : ""} cases
          {report.percent !== null ? ` · ${report.percent}%` : ""}
        </p>
      </div>
      {video ? null : (
        <p className="mt-3 text-[13px] text-muted">This is a still image, not a video. Stories shows it for a few seconds.</p>
      )}
      <div className="mt-4 flex flex-col gap-3">
        <a
          href={made.url}
          download={made.name}
          data-testid="video-download"
          className="btn-3d btn-3d-brand flex h-12 items-center justify-center rounded-btn text-[16px] font-extrabold"
        >
          {video ? "Download Video" : "Download Image (PNG)"}
        </a>
        <div className={`grid gap-3 ${canShare ? "grid-cols-2" : "grid-cols-1"}`}>
          {canShare ? (
            <button
              type="button"
              onClick={onShare}
              data-testid="video-share"
              className="btn-3d btn-3d-soft flex h-12 items-center justify-center gap-2 rounded-btn text-[15px] font-bold"
            >
              <ShareIcon className="size-4" />
              Share
            </button>
          ) : null}
          <button
            type="button"
            onClick={onPreview}
            data-testid="video-preview-again"
            className="btn-3d btn-3d-soft flex h-12 items-center justify-center gap-2 rounded-btn text-[15px] font-bold"
          >
            <ReplayIcon className="size-4" />
            Preview Again
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 items-center justify-center rounded-btn text-[15px] font-bold text-muted hover:bg-surface-2"
        >
          Close
        </button>
      </div>
      <p className="mt-2 text-[13px] text-muted">
        {canShare
          ? "Tap Share and pick Instagram (Stories), or save it to your photos first."
          : "Download it, then add it to your Instagram Story from your gallery."}
      </p>
      {note ? (
        <p role="status" className="mt-2 text-[13px] font-semibold text-warning-text">
          {note}
        </p>
      ) : null}
    </div>
  );
}

function Problem({ title, body, onRetry, onBack }: { title: string; body: string; onRetry?: () => void; onBack: () => void }) {
  return (
    <div className="mt-2" role="alert" data-testid="video-problem">
      <div className="flex items-start gap-3 rounded-tile bg-warning-soft p-4">
        <AlertIcon className="mt-0.5 size-5 shrink-0 text-warning-text" />
        <div>
          <p className="text-[16px] font-extrabold">{title}</p>
          <p className="mt-1 text-[14px] text-muted">{body}</p>
        </div>
      </div>
      <div className={`mt-5 grid gap-3 ${onRetry ? "grid-cols-2" : "grid-cols-1"}`}>
        <button type="button" onClick={onBack} className="btn-3d btn-3d-soft flex h-12 items-center justify-center rounded-btn text-[15px] font-bold">
          Close
        </button>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            data-testid="video-retry"
            className="btn-3d btn-3d-brand flex h-12 items-center justify-center rounded-btn text-[16px] font-extrabold"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
