import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign-in problem",
};

export default function AuthErrorPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        We couldn&apos;t sign you in
      </h1>
      <p className="mt-3 text-base leading-relaxed text-muted">
        The sign-in link is invalid or has expired. Please request a new one.
      </p>
      <Link
        href="/login"
        className="mt-6 self-start rounded-lg bg-foreground px-4 py-3 text-base font-medium text-background"
      >
        Back to sign in
      </Link>
    </main>
  );
}
