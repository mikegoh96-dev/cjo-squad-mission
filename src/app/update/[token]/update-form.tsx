"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { MAX_CASE_COUNT } from "@/lib/validation/case-count";
import { type SaveState, saveCaseCount } from "./actions";

const initialState: SaveState = { status: "idle" };

export function UpdateForm({
  token,
  monthLabel,
  initialCount,
}: {
  token: string;
  monthLabel: string;
  initialCount: number;
}) {
  const [state, formAction, pending] = useActionState(saveCaseCount, initialState);
  const [value, setValue] = useState(String(initialCount));
  const current = Number.parseInt(value, 10);
  const step = (delta: number) =>
    setValue(String(Math.min(MAX_CASE_COUNT, Math.max(0, (Number.isNaN(current) ? 0 : current) + delta))));

  return (
    <form action={formAction} className="mt-6">
      <input type="hidden" name="token" value={token} />
      <label htmlFor="caseCount" className="text-sm font-medium text-muted">
        {monthLabel} cases
      </label>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Decrease"
          className="h-12 w-12 rounded-lg border border-muted/40 text-2xl"
        >
          −
        </button>
        <input
          id="caseCount"
          name="caseCount"
          inputMode="numeric"
          pattern="[0-9]*"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-12 w-24 rounded-lg border border-muted/40 bg-background text-center text-2xl font-semibold"
        />
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Increase"
          className="h-12 w-12 rounded-lg border border-muted/40 text-2xl"
        >
          +
        </button>
      </div>
      <p className="mt-2 text-sm text-muted">Enter your current total for {monthLabel}.</p>

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-lg bg-foreground px-4 py-3 text-base font-medium text-background disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>

      {state.status === "saved" ? (
        <p role="status" className="mt-4 font-medium">
          Saved: {state.caseCount} cases for {monthLabel}.
        </p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="mt-4 text-red-600 dark:text-red-400">
          {state.message}
        </p>
      ) : null}

      <Link href="/" className="mt-6 inline-block underline">
        Back to squad dashboard
      </Link>
    </form>
  );
}
