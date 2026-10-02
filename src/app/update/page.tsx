import type { Metadata, Route } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { ChevronRightIcon, FlagIcon, UsersIcon } from "@/components/icons";
import { Avatar, Card } from "@/components/ui";
import { getRecentUpdates } from "@/lib/data/case-updates";
import { getDashboard } from "@/lib/data/dashboard";
import { isUuid } from "@/lib/ids";
import { pluralCases } from "@/lib/mission";
import type { Contribution } from "@/lib/progress";
import { getRememberedMember } from "@/lib/remembered-member";
import { UpdateScreen } from "./update-screen";

export const metadata: Metadata = {
  title: "Update cases",
  robots: { index: false, follow: false },
};

/**
 * Shared-link case entry: pick your name, then set your total for the open
 * month. `?member=<id>` selects a member; otherwise the member this device last
 * updated is preselected.
 */
export default async function UpdatePage({ searchParams }: PageProps<"/update">) {
  await connection();
  const { member } = await searchParams;
  const requested = isUuid(member) ? member.toLowerCase() : null;
  const chosenId = requested ?? (await getRememberedMember());
  // Load the chosen member's recent updates in parallel with the squad data.
  const [dashboard, recent] = await Promise.all([
    getDashboard(),
    chosenId ? getRecentUpdates(chosenId).catch(() => null) : Promise.resolve(null),
  ]);

  if (dashboard.state !== "ready" || dashboard.progress.contributions.length === 0) {
    return (
      <AppShell eyebrow="Update cases" title="Who's updating?">
        <Card className="animate-rise text-center" data-testid="no-members">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <UsersIcon className="size-7" />
          </span>
          <h2 className="mt-4 text-xl font-bold">No squad members yet</h2>
          <p className="mt-2 text-[15px] text-muted">Your squad lead will add everyone soon.</p>
        </Card>
      </AppShell>
    );
  }

  const { progress, squadName } = dashboard;
  const { focus } = progress;

  if (focus.phase !== "current") {
    return (
      <AppShell eyebrow="Update cases" title="Updates are closed">
        <Card className="animate-rise text-center" data-testid="no-open-month">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-muted">
            <FlagIcon className="size-7" />
          </span>
          <h2 className="mt-4 text-xl font-bold">No mission month is open</h2>
          <p className="mt-2 text-[15px] text-muted">
            {progress.phase === "before"
              ? `Updates open on 1 ${focus.label}.`
              : "The mission has finished. Thank you, squad!"}
          </p>
        </Card>
      </AppShell>
    );
  }

  const selected = progress.contributions.find((c) => c.squadMemberId === chosenId);

  if (!selected) {
    return (
      <AppShell eyebrow="Update cases" title="Who's updating?" subtitle={`${squadName} · tap your name`}>
        <MemberPicker members={progress.contributions} monthLabel={focus.label} />
      </AppShell>
    );
  }

  return (
    <AppShell eyebrow="Update cases" title="How are you doing today?">
      <UpdateScreen
        key={selected.squadMemberId}
        member={{ id: selected.squadMemberId, name: selected.displayName, initials: selected.initials }}
        squadName={squadName}
        month={{ key: focus.month, label: focus.label }}
        initialCount={selected.monthCases}
        squad={{ total: focus.progress.total, target: focus.progress.target }}
        otherMonths={progress.months
          .filter((m) => m.month !== focus.month)
          .map((m) => ({ key: m.month, label: m.label, phase: m.phase }))}
        recent={recent}
      />
    </AppShell>
  );
}

function MemberPicker({ members, monthLabel }: { members: Contribution[]; monthLabel: string }) {
  return (
    <section aria-label="Squad members" className="animate-rise">
      <ul className="grid grid-cols-2 gap-3" data-testid="member-picker">
        {members.map((m) => (
          <li key={m.squadMemberId}>
            <Link
              href={`/update?member=${m.squadMemberId}` as Route}
              className="flex h-full flex-col items-start gap-3 rounded-[24px] bg-surface p-4 shadow-card transition-transform active:scale-[0.98]"
              data-testid="pick-member"
            >
              <Avatar name={m.displayName} id={m.squadMemberId} initials={m.initials} size="lg" />
              <span className="flex w-full items-end justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-bold">{m.displayName}</span>
                  <span className="block text-[13px] text-muted">
                    {monthLabel}: {pluralCases(m.monthCases)}
                  </span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-4 px-1 text-[13px] leading-relaxed text-muted">
        No login needed. Anyone with this link can update, so please only change your own number. Every change is
        recorded.
      </p>
    </section>
  );
}
