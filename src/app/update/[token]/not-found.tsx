import Link from "next/link";
import { LockIcon } from "@/components/icons";
import { Card } from "@/components/ui";

export default function UpdateLinkNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-16 pb-10">
      <Card className="animate-rise text-center" data-testid="invalid-link">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-warning-soft text-warning-text">
          <LockIcon className="size-7" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">This update link isn&apos;t valid</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          It may have been replaced with a new one. Ask your squad lead for your latest link.
        </p>
        <Link href="/" className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-accent text-[16px] font-semibold text-white">
          See squad progress
        </Link>
      </Card>
    </main>
  );
}
