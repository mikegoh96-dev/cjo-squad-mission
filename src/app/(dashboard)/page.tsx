import { connection } from "next/server";
import { RocketIcon } from "@/components/icons";
import { CampaignOverview } from "@/components/mission/campaign-overview";
import { MissionHero } from "@/components/mission/mission-hero";
import { MissionJourney } from "@/components/mission/mission-journey";
import { SquadList } from "@/components/mission/squad-list";
import { UpdateCta } from "@/components/mission/update-cta";
import { Card } from "@/components/ui";
import { siteConfig } from "@/config/site";
import { getDashboard } from "@/lib/data/dashboard";
import { getUpdateContext } from "@/lib/data/update-link";
import { relativeTime } from "@/lib/mission";
import { getRememberedToken } from "@/lib/remembered-link";

export default async function DashboardPage() {
  await connection(); // always render the latest counts
  const [dashboard, rememberedName] = await Promise.all([getDashboard(), getRememberedMemberName()]);

  if (dashboard.state !== "ready") {
    return (
      <Shell eyebrow={siteConfig.name} title="Our squad">
        <Card className="animate-rise text-center" data-testid="empty-state">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
            <RocketIcon className="size-7" />
          </span>
          <h2 className="mt-4 text-xl font-semibold">Mission control is getting ready</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            {dashboard.state === "no-squad"
              ? `${dashboard.campaignName} is set up. Your squad is being added. Check back soon.`
              : "Your squad's mission is being set up. Check back soon."}
          </p>
        </Card>
      </Shell>
    );
  }

  const { progress, squadName, campaignName, lastUpdatedAt } = dashboard;
  const monthTotal = progress.focus.progress.total;

  return (
    <>
      <Shell
        eyebrow={siteConfig.name}
        title={squadName}
        subtitle={
          lastUpdatedAt ? `We achieve this together · updated ${relativeTime(new Date(lastUpdatedAt))}` : "We achieve this together"
        }
      >
        <MissionHero focus={progress.focus} phase={progress.phase} />
        <MissionJourney months={progress.months} />
        <SquadList monthLabel={progress.focus.label} contributions={progress.contributions} squadTotal={monthTotal} />
        <CampaignOverview campaignName={campaignName} overall={progress.overall} milestones={progress.milestones} />
      </Shell>
      <UpdateCta rememberedName={rememberedName} />
    </>
  );
}

async function getRememberedMemberName(): Promise<string | null> {
  const token = await getRememberedToken();
  if (!token) return null;
  try {
    return (await getUpdateContext(token))?.memberName ?? null;
  } catch {
    return null; // never block the dashboard on this convenience lookup
  }
}

function Shell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-[max(24px,env(safe-area-inset-top))] pb-36">
      <header className="animate-rise px-1 pt-2">
        <p className="text-[13px] font-semibold tracking-[0.08em] text-accent uppercase">{eyebrow}</p>
        <h1 className="mt-1 text-[34px] leading-tight font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-[15px] text-muted">{subtitle}</p> : null}
      </header>
      {children}
    </main>
  );
}
