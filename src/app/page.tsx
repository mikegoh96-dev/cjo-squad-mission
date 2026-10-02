import { connection } from "next/server";
import { siteConfig } from "@/config/site";
import { getDashboard } from "@/lib/data/dashboard";
import type { ProgressStage } from "@/lib/progress";

// Functional placeholder layout: the visual redesign comes later.
const STAGE_MESSAGE: Record<ProgressStage, string> = {
  launch: "Mission launched. Every case counts.",
  building: "We're building momentum together.",
  halfway: "A quarter of the way there. Keep going together.",
  "closing-in": "Past halfway. The squad is closing in.",
  "final-push": "Final push. We're almost there.",
  accomplished: "Mission accomplished. We did this together.",
};

export default async function DashboardPage() {
  await connection(); // always render with the latest counts
  const dashboard = await getDashboard();

  if (dashboard.state !== "ready") {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">{siteConfig.name}</h1>
        <p className="mt-4 text-muted">
          {dashboard.state === "no-campaign"
            ? "No campaign has been set up yet."
            : "No squad has been set up yet."}
        </p>
      </main>
    );
  }

  const { campaignName, squadName, progress } = dashboard;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
      <p className="text-sm font-medium tracking-wide text-muted uppercase">{campaignName}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{squadName}</h1>
      <p className="mt-2 text-base">We are achieving this together.</p>

      <section aria-labelledby="squad-total" className="mt-8">
        <h2 id="squad-total" className="text-sm font-medium text-muted">Squad progress</h2>
        <p className="mt-1 text-4xl font-semibold" data-testid="squad-total">
          {progress.totalCases} <span className="text-xl text-muted">/ {progress.overallTarget} cases</span>
        </p>
        <p className="mt-1" data-testid="squad-percent">
          {progress.percent}% complete · {progress.remaining} to go
        </p>
        <p className="mt-2 font-medium" data-testid="squad-stage">{STAGE_MESSAGE[progress.stage]}</p>
      </section>

      <section aria-labelledby="months" className="mt-8">
        <h2 id="months" className="text-sm font-medium text-muted">Monthly missions</h2>
        <ul className="mt-2 space-y-2">
          {progress.months.map((m) => (
            <li key={m.month} data-testid={`month-${m.month}`}>
              <span className="font-medium">{m.label}</span>
              {m.status === "current" ? " (this month)" : ""}: {m.total} / {m.target} ({m.percent}%)
              {m.achieved ? " · achieved" : ` · ${m.remaining} to go`}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="milestones" className="mt-8">
        <h2 id="milestones" className="text-sm font-medium text-muted">Mission milestones</h2>
        <ul className="mt-2 space-y-1">
          {progress.milestones.map((m) => (
            <li key={m.percent}>
              {m.reached ? "✓" : "○"} {m.percent}% · {m.cases} cases
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="contributions" className="mt-8">
        <h2 id="contributions" className="text-sm font-medium text-muted">Our contributions</h2>
        <ul className="mt-2 space-y-1" data-testid="contributions">
          {progress.contributions.map((c) => (
            <li key={c.squadMemberId}>
              {c.displayName}: {c.total}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
