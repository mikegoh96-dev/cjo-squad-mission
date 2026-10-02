import Link from "next/link";
import { FlagIcon } from "@/components/icons";
import { Card } from "@/components/ui";

export function NoOpenMonth({ memberName, squadName }: { memberName: string; squadName: string }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-[max(24px,env(safe-area-inset-top))] pb-10">
      <header className="px-1">
        <p className="text-[13px] font-semibold tracking-[0.08em] text-accent uppercase">{squadName}</p>
        <h1 className="mt-1 text-[34px] leading-tight font-bold tracking-tight uppercase">{memberName}</h1>
      </header>
      <Card className="animate-rise text-center" data-testid="no-open-month">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-surface-2 text-muted">
          <FlagIcon className="size-7" />
        </span>
        <h2 className="mt-4 text-xl font-semibold">No mission month is open</h2>
        <p className="mt-2 text-[15px] text-muted">Updates open when the next mission month starts.</p>
        <Link href="/" className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-surface-2 text-[16px] font-semibold">
          Back to squad progress
        </Link>
      </Card>
    </main>
  );
}
