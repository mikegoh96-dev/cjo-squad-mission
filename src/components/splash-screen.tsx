"use client";

import { useEffect, useRef } from "react";
import { Trophy3D } from "@/components/art/objects";
import { squadConfig } from "@/config/squad";

/**
 * Launch screen for the website and the Home Screen app.
 *
 * It is server-rendered, so it paints with the very first HTML (before any
 * JavaScript) and animates with CSS only (globals.css, "Splash"). The bar
 * follows real, observable stages; it never shows 100% before the page is
 * actually on screen:
 *   page arrived (CSS boot animation)  -> up to 18%
 *   app code running (this mounted)    -> up to 55%   "Fetching squad progress…"
 *   squad data on screen               -> up to 90%   "Almost ready…"
 *   fonts ready                        -> 100%, then fade into the app
 * Between stages it creeps toward the next cap and stops short of it.
 *
 * It lives in the root layout, so it runs once per full page load (a fresh
 * launch, a reload or an app update) and never on Squad/Mission/Settings
 * navigation. If the data fails, it steps aside for the existing error screen
 * ("Try again"). If nothing arrives, a "Try again" link appears after 12 s;
 * that part needs no JavaScript.
 */
const STAGES = { app: 0.55, data: 0.9 } as const;
/** Never flash: keep it at least this long after navigation start. */
const MIN_VISIBLE_MS = 2000;
const FINISH_MS = 450;
const FADE_MS = 520;

export function SplashScreen() {
  const root = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = root.current;
    const fillEl = fill.current;
    if (!el || !fillEl || !bar.current || !status.current) return;
    const barEl = bar.current;
    const statusEl = status.current;

    // Take over from the CSS boot animation at whatever point it reached.
    const matrix = getComputedStyle(fillEl).transform;
    let value: number = matrix && matrix !== "none" ? Number(matrix.slice(7).split(",")[0]) || 0.18 : 0.18;
    fillEl.style.animation = "none";
    fillEl.style.transform = `scaleX(${value})`;

    let cap: number = STAGES.app;
    let raf = 0;
    let finished = false;
    const timers: number[] = [];
    const setStatus = (text: string, percent: number) => {
      statusEl.textContent = text;
      barEl.setAttribute("aria-valuenow", String(Math.round(percent * 100)));
    };

    const tick = () => {
      // Ease toward the current stage's cap, always stopping just short of it.
      value += (cap - 0.015 - value) * 0.03;
      fillEl.style.transform = `scaleX(${Math.max(0, value)})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const dataReady = () =>
      !document.querySelector("[data-testid=loading-state]") && Boolean(document.querySelector("main"));
    const failed = () => Boolean(document.querySelector("[data-testid=error-state]"));

    const close = (complete: boolean) => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      cancelAnimationFrame(raf);
      const wait = Math.max(0, MIN_VISIBLE_MS - performance.now());
      timers.push(
        window.setTimeout(() => {
          if (complete) {
            // Data is on screen: now (and only now) the bar may reach 100%.
            fillEl.style.transition = `transform ${FINISH_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
            fillEl.style.transform = "scaleX(1)";
            setStatus("Ready", 1);
          }
          timers.push(
            window.setTimeout(
              () => {
                el.dataset.state = "done";
                timers.push(window.setTimeout(() => (el.hidden = true), FADE_MS + 40));
              },
              complete ? FINISH_MS : 0,
            ),
          );
        }, wait),
      );
    };

    let fontsReady = false;
    const check = () => {
      if (finished) return;
      if (failed()) {
        // Reveal the error screen (it has Try again); never claim 100%.
        setStatus("Couldn't load squad progress", value);
        close(false);
        return;
      }
      if (!dataReady()) return;
      if (cap < STAGES.data) {
        cap = STAGES.data;
        setStatus("Almost ready…", STAGES.data);
      }
      if (fontsReady) close(true);
    };

    // Stage: app code is running.
    setStatus(dataReady() ? "Almost ready…" : "Fetching squad progress…", STAGES.app);
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    const fonts = document.fonts?.ready ?? Promise.resolve();
    // Fonts get at most 0.5 s: they swap in cleanly anyway (font-display: swap).
    Promise.race([fonts, new Promise((r) => timers.push(window.setTimeout(r, 500)))]).then(() => {
      fontsReady = true;
      check();
    });
    check();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return (
    <div ref={root} id="cjo-splash" className="splash" data-state="loading" data-testid="splash">
      <div className="splash-glow" aria-hidden="true" />
      <div className="splash-center">
        <div className="splash-logo" aria-hidden="true">
          <span className="splash-tile">
            <span className="splash-shine" />
          </span>
          <Trophy3D className="splash-trophy" />
        </div>
        <p className="splash-title">{squadConfig.appName}</p>
        <p className="splash-tag">One squad. One mission.</p>
        <div
          ref={bar}
          className="splash-bar"
          role="progressbar"
          aria-label={`Loading ${squadConfig.appName}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={18}
        >
          <div ref={fill} className="splash-fill" />
        </div>
        <p ref={status} className="splash-status" role="status">
          Loading the app…
        </p>
        {/* A plain form reloads this page even if the app's code never loaded. */}
        <form className="splash-slow">
          <span>Taking longer than usual.</span>
          <button type="submit" className="splash-retry">
            Try again
          </button>
        </form>
      </div>
    </div>
  );
}
