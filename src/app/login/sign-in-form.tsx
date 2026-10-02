"use client";

import { useActionState } from "react";
import { signInWithEmail, type SignInState } from "@/lib/auth/actions";

const initialState: SignInState = { status: "idle" };

export function SignInForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(
    signInWithEmail,
    initialState,
  );

  if (state.status === "sent") {
    return (
      <p role="status" className="mt-6 text-base leading-relaxed">
        Check <strong>{state.email}</strong> for a sign-in link. You can close
        this page.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-3">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label htmlFor="email" className="text-sm font-medium">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        className="rounded-lg border border-muted/40 bg-background px-3 py-3 text-base"
      />
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-foreground px-4 py-3 text-base font-medium text-background disabled:opacity-60"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
