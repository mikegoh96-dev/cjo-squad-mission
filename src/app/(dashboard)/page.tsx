import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { RocketIcon, UsersIcon } from "@/components/icons";
import { Celebration } from "@/components/mission/celebration";
import { MissionHero } from "@/components/mission/mission-hero";
import { MomentumCard } from "@/components/mission/momentum-card";
import { MonthCards } from "@/components/mission/month-cards";
import { SquadList } from "@/components/mission/squad-list";
import { Card } from "@/components/ui";
import { siteConfig } from "@/config/site";
import { type Dashboard, getDashboard } from "@/lib/data/dashboard";
import { relativeTime } from "@/lib/mission";
import type { Contribution } from "@/lib/progress";

export default async function DashboardPage() {
  await connection(); // always render the latest counts
  const dashboard = await getDashboard();
  if (dashboard.state !== "ready") return <NotReady dashboard={dashboard} />;

  const { progress, squadId, squadName, momentum, lastUpdatedAt } = dashboard;
  const { focus, milestones } = progress;
  const reached = focus.phase === "current" ? milestones.filter((m) => m.reached).at(-1) : undefined;

  return (
    <AppShell
      eyebrow={siteConfig.name}
      title={siteConfig.tagline}
      subtitle={
        <>
          <span className="font-semibold text-foreground">{squadName}</span>
          {lastUpdatedAt ? ` · updated ${relativeTime(new Date(lastUpdatedAt))}` : null}
        </>
      }
      aside={<MemberCount people={progress.contributions} />}
    >
      <MissionHero focus={focus} phase={progress.phase} milestones={milestones} />
      <MomentumCard today={momentum.today} thisWeek={momentum.thisWeek} />
      <MonthCards months={progress.months} />
      <SquadList contributions={progress.contributions} monthLabel={focus.label} total={focus.progress.total} />
      {reached ? (
        <Celebration
          title={`${reached.label}!`}
          message={`The squad reached ${reached.cases} ${reached.cases === 1 ? "case" : "cases"} in ${focus.label}.`}
          cases={reached.cases}
          storageKey={`cjo:milestone:${squadId}:${focus.month}`}
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
        <span className="bg-brand mx-auto flex size-14 items-center justify-center rounded-2xl text-white">
          <RocketIcon className="size-7" />
        </span>
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
