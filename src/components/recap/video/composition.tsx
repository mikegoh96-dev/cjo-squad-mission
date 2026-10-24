"use client";

// The monthly recap video, drawn frame by frame on a 1080 × 1920 canvas. A
// dedicated composition (not a recording of the page): the same drawFrame()
// powers the in-app preview and every frame of the exported MP4, so the two
// can't drift apart. It only draws what the VideoReport says.
//
// Look: the Mission page's design language (lavender background with soft
// light, white cards with a lip, the blue -> violet brand gradient, the ring,
// glossy milestone tiles and the original 3D objects from components/art).
// Key content stays between y = 250 and 1600 so Instagram's own overlays
// (profile bar on top, reply bar at the bottom) don't cover it.
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Bolt3D, Gem3D, Medal3D, Star3D, Trophy3D } from "@/components/art/objects";
import { type MilestoneKey, formatDelta } from "@/lib/mission";
import {
  type MonthlyVideoReport,
  VIDEO,
  type VideoReport,
  type WeeklyVideoReport,
  resultLine,
  sceneAt,
  targetLine,
} from "@/lib/recap-video";

type Art = "trophy" | "medal" | "star" | "bolt" | "gem";
export type VideoAssets = {
  font: string;
  logo: CanvasImageSource;
  art: Record<Art, CanvasImageSource>;
  /** Pre-blurred card shadows (blur is expensive per frame). */
  shadows: Map<string, HTMLCanvasElement>;
};

const C = {
  bgTop: "#f2f4fe",
  bgBottom: "#e2e6fa",
  ink: "#12152b",
  muted: "#5d6178",
  accent: "#3a63e8",
  accentStrong: "#2f54d6",
  track: "#dde5fc",
  brandFrom: "#3d5fe0",
  brandTo: "#6a4ae0",
  lip: "#dde3f5",
  heroLip: "#2a3790",
  good: "#16a34a",
  goodText: "#15803d",
  goodSoft: "#e3f7ea",
  flameText: "#c2410c",
  flameSoft: "#ffeedd",
};
const MILESTONE_ART: Record<MilestoneKey, Art> = { started: "star", halfway: "medal", momentum: "bolt", cleared: "trophy" };

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

/** Turns one of the inline-SVG art objects into a bitmap, with its shared materials. */
async function rasterizeArt(node: React.ReactElement, size: number): Promise<HTMLCanvasElement> {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(node));
  const svg = host.querySelector("svg")?.cloneNode(true) as SVGSVGElement | undefined;
  root.unmount();
  if (!svg) throw new Error("art did not render");
  const defs = document.getElementById("art-gold")?.closest("defs");
  if (defs) svg.insertBefore(defs.cloneNode(true), svg.firstChild);
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.removeAttribute("class");
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    canvas.getContext("2d")?.drawImage(img, 0, 0, size, size);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

export async function loadVideoAssets(): Promise<VideoAssets> {
  // The app's own Plus Jakarta Sans (next/font), with a safe fallback.
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-jakarta").trim() || "system-ui, sans-serif";
  await Promise.all(
    [600, 700, 800].map((w) => document.fonts?.load(`${w} 64px ${family}`).catch(() => undefined) ?? undefined),
  );
  const [logo, trophy, medal, star, bolt, gem] = await Promise.all([
    loadImage("/icon-512.png"),
    rasterizeArt(<Trophy3D />, 512),
    rasterizeArt(<Medal3D />, 320),
    rasterizeArt(<Star3D />, 400),
    rasterizeArt(<Bolt3D />, 320),
    rasterizeArt(<Gem3D />, 320),
  ]);
  return { font: family, logo, art: { trophy, medal, star, bolt, gem }, shadows: new Map() };
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
/** Overshoots a little, then settles (for pops). */
const backOut = (t: number) => {
  const x = clamp01(t);
  const c = 1.6;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
};
/** 0 -> 1 between `start` and `start + dur` (ms). */
const phase = (local: number, start: number, dur: number) => clamp01((local - start) / dur);

function font(a: VideoAssets, size: number, weight = 800) {
  return `${weight} ${size}px ${a.font}`;
}

function text(
  ctx: Ctx,
  a: VideoAssets,
  value: string,
  x: number,
  y: number,
  opts: { size: number; weight?: number; color?: string; align?: CanvasTextAlign; spacing?: number; maxWidth?: number },
) {
  let size = opts.size;
  ctx.textAlign = opts.align ?? "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = opts.color ?? C.ink;
  (ctx as Ctx & { letterSpacing?: string }).letterSpacing = `${opts.spacing ?? 0}px`;
  ctx.font = font(a, size, opts.weight);
  // Shrink to fit rather than clip.
  if (opts.maxWidth) {
    while (size > 12 && ctx.measureText(value).width > opts.maxWidth) {
      size -= 2;
      ctx.font = font(a, size, opts.weight);
    }
  }
  ctx.fillText(value, x, y);
  (ctx as Ctx & { letterSpacing?: string }).letterSpacing = "0px";
}

/** Up to two lines of left-aligned text, wrapped at word boundaries (shrinks only if still too long). */
function wrapped(ctx: Ctx, a: VideoAssets, value: string, x: number, midY: number, size: number, maxWidth: number, color: string) {
  ctx.font = font(a, size, 700);
  const words = value.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxWidth && lines.length === 0) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  lines.push(line);
  const lh = size * 1.2;
  const top = midY - ((lines.length - 1) * lh) / 2 + size * 0.36;
  lines.forEach((l, i) => text(ctx, a, l, x, top + i * lh, { size, weight: 700, align: "left", color, maxWidth }));
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function shadowSprite(a: VideoAssets, w: number, h: number, r: number, color: string): HTMLCanvasElement {
  const key = `${w}x${h}x${r}x${color}`;
  const cached = a.shadows.get(key);
  if (cached) return cached;
  const pad = 90;
  const c = document.createElement("canvas");
  c.width = w + pad * 2;
  c.height = h + pad * 2;
  const g = c.getContext("2d") as Ctx;
  g.shadowColor = color;
  g.shadowBlur = 60;
  g.shadowOffsetY = 28;
  g.fillStyle = "#000";
  roundRect(g, pad, pad, w, h, r);
  g.fill();
  // Keep only the shadow (the card itself is drawn on top later).
  g.globalCompositeOperation = "destination-out";
  g.shadowColor = "transparent";
  roundRect(g, pad, pad, w, h, r);
  g.fill();
  a.shadows.set(key, c);
  return c;
}

/** A raised card: soft drop shadow, a thick bottom lip, then the face. */
function card(
  ctx: Ctx,
  a: VideoAssets,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  face: string | CanvasGradient,
  lip: string,
  shadow = "rgba(40, 60, 140, 0.28)",
) {
  ctx.drawImage(shadowSprite(a, w, h, r, shadow), x - 90, y - 90);
  ctx.fillStyle = lip;
  roundRect(ctx, x, y + 12, w, h, r);
  ctx.fill();
  ctx.fillStyle = face;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  // Inner top highlight.
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  const hl = ctx.createLinearGradient(0, y, 0, y + 60);
  hl.addColorStop(0, "rgba(255,255,255,0.45)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hl;
  ctx.fillRect(x, y, w, 60);
  ctx.restore();
}

function brand(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(x, y, x + w * 0.7, y + h);
  g.addColorStop(0, C.brandFrom);
  g.addColorStop(1, C.brandTo);
  return g;
}

function rays(ctx: Ctx, cx: number, cy: number, radius: number, rotation: number, alpha: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  g.addColorStop(0, `rgba(255,255,255,${alpha})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  for (let i = 0; i < 18; i++) {
    const a0 = (i * Math.PI * 2) / 18;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, a0, a0 + Math.PI / 36);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function glow(ctx: Ctx, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function pill(ctx: Ctx, a: VideoAssets, label: string, cx: number, cy: number, bg: string, fg: string, size = 40) {
  ctx.font = font(a, size, 800);
  (ctx as Ctx & { letterSpacing?: string }).letterSpacing = "2px";
  const w = Math.min(900, ctx.measureText(label).width + 96);
  (ctx as Ctx & { letterSpacing?: string }).letterSpacing = "0px";
  const h = size * 2.2;
  ctx.fillStyle = bg;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fill();
  text(ctx, a, label, cx, cy + size * 0.36, { size, color: fg, spacing: 2, maxWidth: w - 60 });
}

function meter(ctx: Ctx, x: number, y: number, w: number, h: number, value: number, track: string, fill: string | CanvasGradient) {
  ctx.fillStyle = track;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  if (value <= 0) return;
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, Math.max(h, (w * Math.min(100, value)) / 100), h, h / 2);
  ctx.fill();
}

function image(ctx: Ctx, img: CanvasImageSource, cx: number, cy: number, size: number) {
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

/** Draws the frame at `ms` from the start onto a 1080 × 1920 context. */
export function drawFrame(ctx: Ctx, r: VideoReport, a: VideoAssets, ms: number) {
  const { width: W, height: H } = VIDEO;
  const s = sceneAt(ms);

  // Background: lavender, soft drifting light, faint rays from the top.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, C.bgTop);
  bg.addColorStop(1, C.bgBottom);
  ctx.globalAlpha = 1;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const drift = ms / 1000;
  glow(ctx, 200 + Math.sin(drift * 0.5) * 60, 260, 700, "rgba(115,146,255,0.30)");
  glow(ctx, 900 + Math.cos(drift * 0.4) * 60, 1600, 760, "rgba(164,135,255,0.30)");
  rays(ctx, W / 2, -120, 1500, drift * 0.03, 0.5);

  // Each scene rises in and fades out (the last one stays as the final frame).
  const last = s.index === 4;
  const fadeIn = easeOut(s.local / 450);
  const fadeOut = last ? 1 : 1 - clamp01((s.local - (s.duration - 320)) / 320);
  ctx.save();
  ctx.globalAlpha = Math.min(fadeIn, fadeOut);
  ctx.translate(0, (1 - fadeIn) * 40);
  if (s.id === "opening") opening(ctx, r, a, s.local);
  else if (s.id === "achievement") {
    if (r.kind === "week") weekAchievement(ctx, r, a, s.local);
    else achievement(ctx, r, a, s.local);
  }
  else if (s.id === "milestones") milestones(ctx, r, a, s.local);
  else if (s.id === "momentum") momentum(ctx, r, a, s.local);
  else closing(ctx, r, a, s.local, ms);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function withAlpha(ctx: Ctx, alpha: number, draw: () => void) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  draw();
  ctx.restore();
}

function scaled(ctx: Ctx, cx: number, cy: number, k: number, draw: () => void) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  ctx.translate(-cx, -cy);
  draw();
  ctx.restore();
}

/** "this week" / "last week" / "that week" / "in October". */
function when(r: VideoReport): string {
  if (r.kind === "month") return `in ${r.monthLabel}`;
  return r.title === "This week" ? "this week" : r.title === "Last week" ? "last week" : "that week";
}

function opening(ctx: Ctx, r: VideoReport, a: VideoAssets, t: number) {
  const pop = backOut(phase(t, 0, 750));
  glow(ctx, 540, 700, 420 * (0.8 + 0.2 * Math.sin(t / 300)), "rgba(255,255,255,0.9)");
  withAlpha(ctx, clamp01(t / 250), () =>
    scaled(ctx, 540, 700, 0.6 + 0.4 * pop, () => {
      ctx.save();
      ctx.shadowColor = "rgba(42,55,144,0.45)";
      ctx.shadowBlur = 50;
      ctx.shadowOffsetY = 24;
      roundRect(ctx, 380, 540, 320, 320, 80);
      ctx.fillStyle = C.brandFrom;
      ctx.fill();
      ctx.restore();
      ctx.save();
      roundRect(ctx, 380, 540, 320, 320, 80);
      ctx.clip();
      ctx.drawImage(a.logo, 380, 540, 320, 320);
      ctx.restore();
    }),
  );
  withAlpha(ctx, phase(t, 350, 400), () =>
    text(ctx, a, "CJO SQUAD MISSION", 540, 990, { size: 40, color: C.accent, spacing: 8 }),
  );
  const rise = easeOut(phase(t, 500, 600));
  withAlpha(ctx, rise, () => {
    ctx.save();
    ctx.translate(0, (1 - rise) * 30);
    text(ctx, a, r.kind === "month" ? `OUR ${r.monthLabel.toUpperCase()}` : "OUR WEEK", 540, 1120, { size: 124, maxWidth: 940 });
    text(ctx, a, r.kind === "month" ? "MISSION" : "TOGETHER", 540, 1250, { size: 124, color: C.accentStrong });
    ctx.restore();
  });
  withAlpha(ctx, phase(t, 900, 500), () => {
    text(ctx, a, r.periodLabel, 540, 1350, { size: 48, weight: 700, color: C.muted, maxWidth: 940 });
    if (r.status === "in-progress") {
      pill(ctx, a, r.kind === "month" ? "MONTH IN PROGRESS" : "WEEK IN PROGRESS", 540, 1460, C.flameSoft, C.flameText, 32);
    }
  });
}

function achievement(ctx: Ctx, r: MonthlyVideoReport, a: VideoAssets, t: number) {
  text(ctx, a, `${r.monthLabel.toUpperCase()} RESULT`, 540, 330, { size: 40, color: C.accent, spacing: 8 });
  card(ctx, a, 90, 390, 900, 1130, 72, "#ffffff", C.lip);

  const grow = easeOut(phase(t, 300, 1800));
  const cx = 540;
  const cy = 820;
  const radius = 300;
  ctx.lineCap = "round";
  ctx.lineWidth = 60;
  ctx.strokeStyle = r.complete ? "#d5f2df" : C.track;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  if (r.target !== null && r.meterPercent > 0) {
    const g = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    g.addColorStop(0, r.complete ? "#4fd47f" : "#7392ff");
    g.addColorStop(1, r.complete ? C.good : C.accent);
    ctx.strokeStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (r.meterPercent / 100) * grow);
    ctx.stroke();
  }
  const shown = Math.round(r.total * grow);
  text(ctx, a, String(shown), cx, cy + 70, { size: 230, maxWidth: 480 });
  text(ctx, a, r.target === null ? "CASES THIS MONTH" : `OF ${r.target} ${r.target === 1 ? "CASE" : "CASES"}`, cx, cy + 150, {
    size: 40,
    color: C.muted,
    spacing: 4,
  });

  withAlpha(ctx, easeOut(phase(t, 2000, 500)), () => {
    if (r.percent !== null) {
      text(ctx, a, `${r.percent}% COMPLETE`, 540, 1290, { size: 92, color: r.complete ? C.goodText : C.ink, maxWidth: 820 });
    } else {
      text(ctx, a, "No target set for this month", 540, 1290, { size: 52, weight: 700, color: C.muted, maxWidth: 820 });
    }
  });
  const line = targetLine(r);
  if (line) {
    const p = phase(t, 2500, 500);
    withAlpha(ctx, clamp01(p * 2), () =>
      scaled(ctx, 540, 1410, 0.8 + 0.2 * backOut(p), () =>
        pill(
          ctx,
          a,
          line.toUpperCase(),
          540,
          1410,
          r.complete ? C.goodSoft : C.flameSoft,
          r.complete ? C.goodText : C.flameText,
          40,
        ),
      ),
    );
  }
  if (r.status === "in-progress") {
    withAlpha(ctx, phase(t, 2900, 500), () =>
      text(ctx, a, "So far this month", 540, 1600, { size: 36, weight: 700, color: C.muted }),
    );
  }
}

/** Weekly result: the week's net cases, a Mon–Sun bar per day, the month(s) as of the week's end. */
function weekAchievement(ctx: Ctx, r: WeeklyVideoReport, a: VideoAssets, t: number) {
  text(ctx, a, "WEEKLY RESULT", 540, 330, { size: 40, color: C.accent, spacing: 8 });
  card(ctx, a, 90, 390, 900, 1130, 72, "#ffffff", C.lip);

  const grow = easeOut(phase(t, 300, 1500));
  const big = r.added > 0 ? `+${Math.round(r.added * grow)}` : formatDelta(r.added);
  text(ctx, a, big, 540, 650, { size: 220, color: r.added > 0 ? C.accent : C.ink, maxWidth: 760 });
  const label =
    r.added < 0
      ? "NET CHANGE THIS WEEK"
      : r.status === "in-progress"
        ? `${r.added === 1 ? "CASE" : "CASES"} ADDED SO FAR`
        : `${r.added === 1 ? "CASE" : "CASES"} ADDED THIS WEEK`;
  text(ctx, a, label, 540, 730, { size: 40, color: C.muted, spacing: 4, maxWidth: 800 });

  // Mon–Sun bars (days of a running week still ahead are dashed outlines).
  const max = Math.max(1, ...r.days.map((d) => d.net));
  const left = 170;
  const colW = 740 / 7;
  const base = 1090;
  r.days.forEach((d, i) => {
    const x = left + i * colW + (colW - 64) / 2;
    const p = easeOut(phase(t, 500 + i * 90, 700));
    const h = d.net > 0 ? Math.max(14, (d.net / max) * 210) * p : 12;
    if (d.future) {
      ctx.save();
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#b9c3e6";
      roundRect(ctx, x, base - 12, 64, 12, 6);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = d.net > 0 ? brand(ctx, x, base - h, 64, h) : C.track;
      roundRect(ctx, x, base - h, 64, h, Math.min(16, h / 2));
      ctx.fill();
      if (d.net > 0) withAlpha(ctx, p, () => text(ctx, a, String(d.net), x + 32, base - h - 16, { size: 34, color: C.accentStrong }));
    }
    text(ctx, a, d.label, x + 32, base + 50, { size: 30, weight: 700, color: d.future ? "#9aa1bd" : C.muted });
  });

  // The month(s) the week belongs to, as they stood at the end of the week.
  const rows = r.months.slice(0, 2);
  const top = rows.length === 1 ? 1260 : 1225;
  withAlpha(ctx, easeOut(phase(t, 1700, 500)), () => {
    rows.forEach((m, i) => {
      const y = top + i * 120;
      text(ctx, a, m.label, 170, y, { size: 40, align: "left" });
      text(ctx, a, `${m.total} / ${m.target} · ${m.percent}%`, 910, y, {
        size: 40,
        align: "right",
        color: m.complete ? C.goodText : C.ink,
      });
      const fill = ctx.createLinearGradient(0, y + 24, 0, y + 52);
      fill.addColorStop(0, m.complete ? "#4fd47f" : "#7392ff");
      fill.addColorStop(1, m.complete ? C.good : C.accent);
      meter(ctx, 170, y + 28, 740, 28, m.meterPercent, m.complete ? "#d5f2df" : C.track, fill);
    });
    if (r.shareOfTarget) {
      text(ctx, a, `That's ${r.shareOfTarget.percent}% of the ${r.shareOfTarget.monthLabel} target`, 540, 1420, {
        size: 38,
        weight: 700,
        color: C.muted,
        maxWidth: 800,
      });
    }
  });
  if (r.status === "in-progress") {
    withAlpha(ctx, phase(t, 2400, 500), () => text(ctx, a, "So far this week", 540, 1600, { size: 36, weight: 700, color: C.muted }));
  }
}

function milestones(ctx: Ctx, r: VideoReport, a: VideoAssets, t: number) {
  const list = r.milestones.slice(0, 4);
  if (list.length === 0) {
    const pop = backOut(phase(t, 100, 700));
    scaled(ctx, 540, 760, 0.7 + 0.3 * pop, () => image(ctx, a.art.star, 540, 760 + Math.sin(t / 500) * 10, 380));
    text(ctx, a, "Every case counts", 540, 1100, { size: 92, maxWidth: 940 });
    text(
      ctx,
      a,
      (r.kind === "month" ? r.total : r.added) <= 0
        ? "Every milestone starts with a single case."
        : "Every update moved the squad forward together.",
      540,
      1190,
      { size: 42, weight: 600, color: C.muted, maxWidth: 920 },
    );
    return;
  }
  text(ctx, a, "MILESTONES UNLOCKED", 540, 330, { size: 40, color: C.accent, spacing: 8 });
  text(ctx, a, list.length === 1 ? "1 milestone" : `${list.length} milestones`, 540, 450, { size: 96 });
  text(ctx, a, `Reached together ${when(r)}`, 540, 530, { size: 42, weight: 600, color: C.muted });

  // 1: one centred tile; 2: a row; 3: two + one centred; 4: a 2 × 2 grid.
  const size = 400;
  const gap = 40;
  const rows = list.length <= 2 ? [list] : [list.slice(0, 2), list.slice(2)];
  const top = rows.length === 1 ? 760 : 620;
  rows.forEach((row, ri) => {
    const rowW = row.length * size + (row.length - 1) * gap;
    row.forEach((m, ci) => {
      const i = ri * 2 + ci;
      const x = (1080 - rowW) / 2 + ci * (size + gap);
      const y = top + ri * (size + gap + 20);
      const p = phase(t, 300 + i * 260, 600);
      withAlpha(ctx, clamp01(p * 2), () =>
        scaled(ctx, x + size / 2, y + size / 2, 0.7 + 0.3 * backOut(p), () => {
          card(ctx, a, x, y, size, size, 60, brand(ctx, x, y, size, size), C.heroLip, "rgba(61,95,224,0.45)");
          ctx.save();
          roundRect(ctx, x, y, size, size, 60);
          ctx.clip();
          glow(ctx, x + size - 40, y + 30, 220, "rgba(255,255,255,0.25)");
          ctx.restore();
          image(ctx, a.art[MILESTONE_ART[m.key]], x + size / 2, y + 150, 210);
          text(ctx, a, m.label, x + size / 2, y + 305, { size: 46, color: "#ffffff", maxWidth: size - 50 });
          text(ctx, a, `${m.cases} ${m.cases === 1 ? "case" : "cases"}`, x + size / 2, y + 355, {
            size: 34,
            weight: 700,
            color: "rgba(255,255,255,0.85)",
          });
        }),
      );
    });
  });
}

function momentum(ctx: Ctx, r: VideoReport, a: VideoAssets, t: number) {
  text(ctx, a, "SQUAD MOMENTUM", 540, 330, { size: 40, color: C.accent, spacing: 8 });
  text(ctx, a, "Stronger together", 540, 450, { size: 96, maxWidth: 940 });

  const stats: [string, string][] = [
    [formatDelta(r.added), `${Math.abs(r.added) === 1 ? "case" : "cases"} added together ${when(r)}`],
  ];
  if (r.contributors > 0) stats.push([String(r.contributors), r.contributors === 1 ? "teammate added cases" : "teammates added cases"]);
  if (r.activeDays > 0) stats.push([String(r.activeDays), r.activeDays === 1 ? "day with cases added" : "days with cases added"]);

  stats.forEach(([value, label], i) => {
    const y = 560 + i * 230;
    const p = easeOut(phase(t, 200 + i * 220, 500));
    withAlpha(ctx, p, () => {
      ctx.save();
      ctx.translate((1 - p) * 60, 0);
      card(ctx, a, 120, y, 840, 190, 56, "#ffffff", C.lip);
      text(ctx, a, value, 300, y + 128, { size: 104, color: C.accent, maxWidth: 300 });
      wrapped(ctx, a, label, 470, y + 95, 42, 450, C.ink);
      ctx.restore();
    });
  });

  if (r.campaign) {
    const c = r.campaign;
    const y = 1270;
    const p = easeOut(phase(t, 900, 600));
    withAlpha(ctx, p, () => {
      card(ctx, a, 120, y, 840, 300, 60, brand(ctx, 120, y, 840, 300), C.heroLip, "rgba(61,95,224,0.45)");
      text(ctx, a, c.name, 170, y + 80, { size: 36, weight: 700, align: "left", color: "rgba(255,255,255,0.88)", maxWidth: 600 });
      text(ctx, a, `${c.percent}%`, 910, y + 80, { size: 40, align: "right", color: "#ffffff" });
      text(ctx, a, `${c.total} of ${c.target} cases together`, 170, y + 170, {
        size: 60,
        align: "left",
        color: "#ffffff",
        maxWidth: 740,
      });
      const fill = ctx.createLinearGradient(0, y + 210, 0, y + 246);
      fill.addColorStop(0, "#ffffff");
      fill.addColorStop(1, "#dfe6ff");
      meter(ctx, 170, y + 212, 740, 34, c.meterPercent * easeOut(phase(t, 1100, 1200)), "rgba(31,42,122,0.35)", fill);
    });
  }
}

function closing(ctx: Ctx, r: VideoReport, a: VideoAssets, t: number, ms: number) {
  const x = 60;
  const y = 290;
  const w = 960;
  const h = 1300;
  card(ctx, a, x, y, w, h, 80, brand(ctx, x, y, w, h), C.heroLip, "rgba(61,95,224,0.5)");
  ctx.save();
  roundRect(ctx, x, y, w, h, 80);
  ctx.clip();
  rays(ctx, 540, 560, 1100, ms / 9000, 0.22);
  glow(ctx, 540, 600, 420, "rgba(255,255,255,0.35)");
  glow(ctx, 900, 1450, 420, "rgba(157,123,255,0.5)");
  ctx.restore();

  const pop = backOut(phase(t, 0, 800));
  scaled(ctx, 540, 600, 0.6 + 0.4 * pop, () => image(ctx, a.art.trophy, 540, 600 + Math.sin(t / 600) * 14, 470));
  const rise = easeOut(phase(t, 300, 600));
  withAlpha(ctx, rise, () => {
    ctx.save();
    ctx.translate(0, (1 - rise) * 30);
    text(ctx, a, "ONE SQUAD.", 540, 990, { size: 118, color: "#ffffff", maxWidth: 880 });
    text(ctx, a, "ONE MISSION.", 540, 1115, { size: 118, color: "#ffffff", maxWidth: 880 });
    ctx.restore();
  });
  withAlpha(ctx, phase(t, 700, 500), () =>
    text(ctx, a, "LET'S KEEP THE MOMENTUM GOING.", 540, 1210, {
      size: 42,
      color: "rgba(255,255,255,0.92)",
      spacing: 3,
      maxWidth: 860,
    }),
  );
  withAlpha(ctx, phase(t, 1000, 500), () => {
    pill(ctx, a, resultLine(r), 540, 1340, "#ffffff", C.accentStrong, 38);
    // Footer: logo + name, centred as one group.
    ctx.font = font(a, 36, 800);
    const name = "CJO Squad Mission";
    const left = 540 - (72 + 18 + ctx.measureText(name).width) / 2;
    ctx.save();
    roundRect(ctx, left, 1455, 72, 72, 20);
    ctx.clip();
    ctx.drawImage(a.logo, left, 1455, 72, 72);
    ctx.restore();
    text(ctx, a, name, left + 90, 1504, { size: 36, align: "left", color: "rgba(255,255,255,0.9)" });
  });
}
