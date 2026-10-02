import Link from "next/link";
import { Card } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-16 pb-10">
      <Card className="text-center">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-[15px] text-muted">This page doesn&apos;t exist.</p>
        <Link href="/" className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-accent text-[16px] font-semibold text-white">
          See squad progress
        </Link>
      </Card>
    </main>
  );
}
