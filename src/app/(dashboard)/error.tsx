"use client";

import { useTransition } from "react";
import { AlertIcon, RefreshIcon } from "@/components/icons";
import { Card } from "@/components/ui";

/** Dashboard error state. "Try again" re-fetches without a full page reload. */
export default function DashboardError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-[max(24px,env(safe-area-inset-top))] pb-12">
      <Card className="animate-rise mt-10 text-center" data-testid="error-state" role="alert">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-warning-soft text-warning-text">
          <AlertIcon className="size-7" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">We couldn&apos;t load squad progress</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          This is usually a brief connection problem. Your squad&apos;s numbers are safe.
        </p>
        <button
          type="button"
          onClick={() => startTransition(() => retry())}
          disabled={pending}
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[16px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-70"
        >
          <RefreshIcon className={`size-5 ${pending ? "animate-spin" : ""}`} />
          {pending ? "Trying again…" : "Try again"}
        </button>
      </Card>
    </main>
  );
}
