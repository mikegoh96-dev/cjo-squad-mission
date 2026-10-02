import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, LockIcon } from "@/components/icons";
import { Card } from "@/components/ui";
import { getSquadMonth, getUpdateContext } from "@/lib/data/update-link";
import { monthLabel } from "@/lib/progress";
import { getRememberedToken } from "@/lib/remembered-link";
import { forgetDevice } from "./actions";
import { NoOpenMonth } from "./no-open-month";
import { UpdateScreen } from "./update-screen";

export const metadata: Metadata = {
  title: "Update my cases",
  robots: { index: false, follow: false },
};

/** "Update my cases" from the dashboard: uses this device's remembered link. */
export default async function UpdateRememberedPage() {
  const token = await getRememberedToken();
  const context = token ? await getUpdateContext(token) : null;

  if (!context) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-[max(16px,env(safe-area-inset-top))] pb-10">
        <Link href="/" className="-ml-2 inline-flex h-11 w-fit items-center gap-1 rounded-full px-2 text-[16px] font-medium text-accent">
          <ChevronLeftIcon className="size-5" />
          Squad progress
        </Link>
        <Card className="animate-rise text-center" data-testid="no-link">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
            <LockIcon className="size-7" />
          </span>
          <h1 className="mt-4 text-xl font-semibold">
            {token ? "This device's update link no longer works" : "Use your personal update link"}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            {token
              ? "It may have been replaced. Open the latest link from your squad lead."
              : "Open the private link your squad lead sent you. After your first update, this device remembers it."}
          </p>
          {token ? (
            <form action={forgetDevice} className="mt-6">
              <button type="submit" className="h-12 w-full rounded-2xl bg-surface-2 text-[16px] font-semibold">
                Forget this device
              </button>
            </form>
          ) : null}
        </Card>
      </main>
    );
  }

  if (!context.month) return <NoOpenMonth memberName={context.memberName} squadName={context.squadName} />;

  const squad = await getSquadMonth(context.squadName, context.month);
  return (
    <UpdateScreen
      token={null}
      memberName={context.memberName}
      squadName={context.squadName}
      monthLabel={monthLabel(context.month)}
      initialCount={context.caseCount}
      squad={squad}
    />
  );
}
