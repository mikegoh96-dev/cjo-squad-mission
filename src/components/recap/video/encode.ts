"use client";

// Encodes the recap composition into a real MP4 on this device: every frame is
// drawn on a 1080 × 1920 canvas, encoded as H.264 by the browser (WebCodecs)
// and muxed into MP4 by Mediabunny (loaded only when needed). Nothing is sent
// to a server. Format is fixed (VIDEO); nothing about it comes from the user.
import { VIDEO, VIDEO_DURATION_MS, VIDEO_FRAMES, type VideoReport } from "@/lib/recap-video";
import { type VideoAssets, drawFrame } from "./composition";

/** ~7 Mbit/s: crisp text and gradients at 1080p, about 18 MB for 20 s. */
const BITRATE = 7_000_000;

export class VideoUnsupportedError extends Error {
  override name = "VideoUnsupportedError";
}
export class VideoCanceledError extends Error {
  override name = "VideoCanceledError";
}

/** True when this browser can encode 1080 × 1920 H.264 (the format Instagram accepts). */
export async function canMakeMp4(): Promise<boolean> {
  if (typeof window === "undefined" || typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return false;
  try {
    const { canEncodeVideo } = await import("mediabunny");
    return await canEncodeVideo("avc", { width: VIDEO.width, height: VIDEO.height, bitrate: BITRATE });
  } catch {
    return false;
  }
}

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = VIDEO.width;
  canvas.height = VIDEO.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new VideoUnsupportedError("canvas unavailable");
  return { canvas, ctx };
}

/**
 * Renders the whole video. `onProgress` gets the share of frames encoded
 * (0–1, real). Aborting the signal stops at the next frame and releases the
 * encoder; nothing is kept.
 */
export async function renderMp4(
  report: VideoReport,
  assets: VideoAssets,
  { onProgress, signal }: { onProgress?: (share: number) => void; signal?: AbortSignal } = {},
): Promise<Blob> {
  if (!(await canMakeMp4())) throw new VideoUnsupportedError("H.264 encoding unavailable");
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output } = await import("mediabunny");
  const { canvas, ctx } = makeCanvas();
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const source = new CanvasSource(canvas, { codec: "avc", bitrate: BITRATE, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: VIDEO.fps });
  await output.start();
  try {
    for (let i = 0; i < VIDEO_FRAMES; i++) {
      if (signal?.aborted) throw new VideoCanceledError("canceled");
      drawFrame(ctx, report, assets, Math.min((i * 1000) / VIDEO.fps, VIDEO_DURATION_MS - 1));
      await source.add(i / VIDEO.fps, 1 / VIDEO.fps);
      onProgress?.((i + 1) / VIDEO_FRAMES);
      // Let the page breathe (progress bar, Cancel) every few frames.
      if (i % 6 === 5) await new Promise((r) => setTimeout(r, 0));
    }
    if (signal?.aborted) throw new VideoCanceledError("canceled");
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => {});
    throw e;
  }
  if (!target.buffer) throw new Error("no video data");
  return new Blob([target.buffer], { type: "video/mp4" });
}

/** The closing frame as a 1080 × 1920 PNG (the fallback when video can't be made). */
export async function renderStillPng(report: VideoReport, assets: VideoAssets): Promise<Blob> {
  const { canvas, ctx } = makeCanvas();
  drawFrame(ctx, report, assets, VIDEO_DURATION_MS - 1);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"),
  );
}
