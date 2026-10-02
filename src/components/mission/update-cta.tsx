"use client";

import Link, { useLinkStatus } from "next/link";
import { useRef } from "react";
import { EditIcon, RefreshIcon } from "@/components/icons";

const buttonClass =
  "flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[17px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(42,120,214,0.6)] transition-transform active:scale-[0.98]";

/**
 * Sticky "Update my cases" action. If this device has used a personal update
 * link before (remembered server-side), it opens that member's update screen;
 * otherwise it explains how to open the personal link.
 */
export function UpdateCta({ rememberedName }: { rememberedName: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background via-background/90 to-transparent pt-8 pb-[max(16px,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto mx-auto w-full max-w-md px-4">
        {rememberedName ? (
          <Link href="/update" className={buttonClass} data-testid="update-cta">
            <CtaLabel />
            <span className="sr-only"> as {rememberedName}</span>
          </Link>
        ) : (
          <button type="button" className={buttonClass} onClick={() => dialog.current?.showModal()} data-testid="update-cta">
            <EditIcon className="size-5" />
            Update my cases
          </button>
        )}
        {rememberedName ? (
          <p className="mt-2 text-center text-xs text-muted">Updating as {rememberedName}</p>
        ) : null}
      </div>

      <dialog
        ref={dialog}
        aria-labelledby="link-help-title"
        className="pointer-events-auto m-0 mt-auto w-full max-w-none rounded-t-[28px] bg-surface p-0 text-foreground backdrop:bg-black/40 sm:mx-auto sm:mb-6 sm:max-w-md sm:rounded-[28px]"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className="mx-auto max-w-md px-6 pt-3 pb-[max(24px,env(safe-area-inset-bottom))]">
          <div aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-hairline" />
          <h2 id="link-help-title" className="mt-5 text-xl font-semibold">
            Use your personal update link
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Each squad member has their own private link for updating cases. Open the link your squad lead sent
            you. After your first update, this device remembers it and this button takes you straight there.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Lost your link? Ask your squad lead for a new one.
          </p>
          <button
            type="button"
            className="mt-6 h-12 w-full rounded-2xl bg-surface-2 text-[16px] font-semibold"
            onClick={() => dialog.current?.close()}
          >
            Got it
          </button>
        </div>
      </dialog>
    </div>
  );
}

/** Label with inline pending feedback while the update screen loads. */
function CtaLabel() {
  const { pending } = useLinkStatus();
  return pending ? (
    <>
      <RefreshIcon className="size-5 animate-spin" />
      Opening…
    </>
  ) : (
    <>
      <EditIcon className="size-5" />
      Update my cases
    </>
  );
}
