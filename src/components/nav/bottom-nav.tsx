"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlagIcon, HomeIcon } from "@/components/icons";

const item =
  "flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-semibold transition-colors";

/** Thumb-friendly bottom navigation: Squad (with the update cards) · Mission. */
export function BottomNav() {
  const path = usePathname();
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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 pb-[max(12px,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto mx-auto flex w-[calc(100%-32px)] max-w-md items-center gap-2 rounded-[26px] bg-surface/95 p-2 shadow-[0_10px_40px_-12px_rgba(30,40,100,0.35)] ring-1 ring-hairline backdrop-blur">
        {tab("/", "Squad", HomeIcon)}
        {tab("/mission", "Mission", FlagIcon)}
      </div>
    </nav>
  );
}
