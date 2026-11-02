"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FlagIcon, GearIcon, HomeIcon } from "@/components/icons";

const item =
  "flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-semibold transition-colors";

// Text fields that bring up the on-screen keyboard.
const KEYBOARD_FIELD =
  "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=range]), textarea, select, [contenteditable=true]";
const isKeyboardField = (el: EventTarget | null) => el instanceof HTMLElement && el.matches(KEYBOARD_FIELD);

/**
 * iOS (Safari and Home Screen apps) can leave fixed bars where the top of the
 * keyboard was after it closes, until the next scroll. So the bar hides while
 * a text field is focused, comes back once focus has left it, and the page is
 * nudged (a no-op scroll) so iOS re-pins it to the bottom.
 */
function useKeyboardOpen(): boolean {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    let timer: number | undefined;
    const repin = () => window.scrollTo(window.scrollX, window.scrollY);
    const onFocusIn = (e: FocusEvent) => {
      if (!isKeyboardField(e.target)) return;
      window.clearTimeout(timer);
      setEditing(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!isKeyboardField(e.target)) return;
      window.clearTimeout(timer);
      // Moving between fields keeps the keyboard up: wait, then check.
      timer = window.setTimeout(() => {
        if (isKeyboardField(document.activeElement)) return;
        setEditing(false);
        repin();
      }, 250);
    };
    const vv = window.visualViewport;
    let lastHeight = vv?.height ?? 0;
    const onViewport = () => {
      if (!vv) return;
      if (vv.height > lastHeight + 80) window.setTimeout(repin, 60); // keyboard just closed
      lastHeight = vv.height;
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    vv?.addEventListener("resize", onViewport);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      vv?.removeEventListener("resize", onViewport);
    };
  }, []);
  return editing;
}

/** Thumb-friendly bottom navigation: Squad (with the update cards) · Mission · Settings. */
export function BottomNav() {
  const path = usePathname();
  const keyboardOpen = useKeyboardOpen();
  const tab = (href: Route, label: string, Icon: typeof HomeIcon) => {
    const active = path === href;
    return (
      <Link
        href={href}
        prefetch
        aria-current={active ? "page" : undefined}
        className={`${item} ${active ? "bg-accent-soft text-accent-strong" : "text-muted"}`}
      >
        <Icon className="size-5" />
        {label}
      </Link>
    );
  };
  return (
    <nav
      aria-label="Main"
      inert={keyboardOpen}
      data-keyboard={keyboardOpen ? "open" : undefined}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 pb-[max(12px,env(safe-area-inset-bottom))] transition-[transform,opacity] duration-200 motion-reduce:transition-none ${
        keyboardOpen ? "translate-y-[calc(100%+24px)] opacity-0" : ""
      }`}
    >
      <div className="pointer-events-auto mx-auto flex w-[calc(100%-32px)] max-w-md items-center gap-2 rounded-card bg-surface/95 p-2 shadow-[0_10px_40px_-12px_rgba(30,40,100,0.35)] ring-1 ring-hairline backdrop-blur">
        {tab("/", "Squad", HomeIcon)}
        {tab("/mission", "Mission", FlagIcon)}
        {tab("/settings", "Settings", GearIcon)}
      </div>
    </nav>
  );
}
