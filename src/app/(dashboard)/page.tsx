import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { Rocket3D } from "@/components/art/objects";
import { UsersIcon } from "@/components/icons";
import { CheerPanel } from "@/components/cheers/cheer-panel";
import { CheckinCard } from "@/components/checkin/checkin-card";
import { Celebration } from "@/components/mission/celebration";
import { LiveDot } from "@/components/live/live-sync";
import { MissionHero } from "@/components/mission/mission-hero";
import { MomentumCard } from "@/components/mission/momentum-card";
import { NotificationsCard } from "@/components/push/notifications-card";
import { LiveBoardProvider } from "@/components/squad/live-board";
import { SquadBoard } from "@/components/squad/squad-board";
import { Card } from "@/components/ui";
import { siteConfig } from "@/config/site";
import { type Dashboard, getDashboard } from "@/lib/data/dashboard";
import { relativeTime } from "@/lib/mission";
import { isPushConfigured } from "@/lib/push/server";
import type { Contribution } from "@/lib/progress";

export default async function DashboardPage() {
  await connection(); // always render the latest counts
  const dashboard = await getDashboard();
  if (dashboard.state !== "ready") return <NotReady dashboard={dashboard} />;

  const { progress, squadId, squadName, momentum, lastUpdatedAt } = dashboard;
  const { focus, milestones } = progress;
  const editable = focus.phase === "current";
  const reached = editable ? milestones.filter((m) => m.reached).at(-1) : undefined;
  const serverCounts = Object.fromEntries(progress.contributions.map((c) => [c.squadMemberId, c.monthCases]));
  const celebrationKey = `cjo:milestone:${squadId}:${focus.month}`;
  // Push notifications are offered only when the server is fully configured.
  const vapidPublicKey = isPushConfigured() ? (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null) : null;

  return (
    <AppShell
      eyebrow={siteConfig.name}
      title={siteConfig.tagline}
      subtitle={
        <>
          <span className="font-semibold text-foreground">{squadName}</span>
          {lastUpdatedAt ? ` · updated ${relativeTime(new Date(lastUpdatedAt))}` : null}
          <span className="mt-1 block">
            <LiveDot />
          </span>
        </>
      }
      aside={<MemberCount people={progress.contributions} />}
    >
      <LiveBoardProvider
        serverCounts={serverCounts}
        editable={editable}
        target={focus.progress.target}
        monthLabel={focus.label}
        celebrationKey={celebrationKey}
      >
        <MissionHero focus={focus} phase={progress.phase} dayOfMonth={progress.dayOfMonth} />
        <SquadBoard
          members={progress.contributions.map((c) => ({
            id: c.squadMemberId,
            name: c.displayName,
            initials: c.initials,
            count: c.monthCases,
          }))}
          monthLabel={focus.label}
          closedNote={
            progress.phase === "before"
              ? `Updates open on 1 ${focus.label}.`
              : progress.phase === "finished"
                ? "The mission has finished. Thank you, squad!"
                : null
          }
        />
        <CheckinCard
          members={progress.contributions.map((c) => ({ id: c.squadMemberId, name: c.displayName, initials: c.initials }))}
          monthLabel={focus.label}
        />
        <CheerPanel />
        <NotificationsCard
          place="squad"
          vapidPublicKey={vapidPublicKey}
          memberNames={Object.fromEntries(progress.contributions.map((c) => [c.squadMemberId, c.displayName]))}
        />
        <MomentumCard
          today={momentum.today}
          thisWeek={momentum.thisWeek}
          memberWeek={momentum.memberWeek}
          people={progress.contributions.map((c) => ({ id: c.squadMemberId, name: c.displayName, initials: c.initials }))}
        />
      </LiveBoardProvider>
      {reached ? (
        <Celebration
          title={`${reached.label}!`}
          message={`The squad reached ${reached.cases} ${reached.cases === 1 ? "case" : "cases"} in ${focus.label}.`}
          cases={reached.cases}
          storageKey={celebrationKey}
        />
      ) : null}
    </AppShell>
  );
}

function MemberCount({ people }: { people: Contribution[] }) {
  if (people.length === 0) return null;
  return (
    <span className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[13px] font-bold shadow-card">
      <UsersIcon className="size-4 text-accent" />
      {people.length}
      <span className="sr-only"> squad members</span>
    </span>
  );
}

function NotReady({ dashboard }: { dashboard: Exclude<Dashboard, { state: "ready" }> }) {
  return (
    <AppShell eyebrow={siteConfig.name} title={siteConfig.tagline} nav={false}>
      <Card className="animate-rise text-center" data-testid="empty-state">
        <Rocket3D className="animate-float mx-auto size-24" />
        <h2 className="mt-4 text-xl font-bold">Mission control is getting ready</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          {dashboard.state === "no-squad"
            ? `${dashboard.campaignName} is set up. Your squad is being added. Check back soon.`
            : "Your squad's mission is being set up. Check back soon."}
        </p>
      </Card>
    </AppShell>
  );
}
