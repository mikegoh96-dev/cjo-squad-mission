import type { Metadata } from "next";
import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { NotificationsCard } from "@/components/push/notifications-card";
import { Card, Eyebrow } from "@/components/ui";
import { siteConfig } from "@/config/site";
import { QUIET_HOURS_LABEL, RECAP_LABEL } from "@/lib/push/policy";
import { isPushConfigured } from "@/lib/push/server";

export const metadata: Metadata = { title: "Settings" };

/** This phone's notification settings (no accounts: everything here is per phone). */
export default async function SettingsPage() {
  await connection();
  const vapidPublicKey = isPushConfigured() ? (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null) : null;

  return (
    <AppShell eyebrow={siteConfig.name} title="Settings" subtitle="These apply to this phone only.">
      <NotificationsCard place="settings" vapidPublicKey={vapidPublicKey} />
      <Card className="animate-rise" aria-labelledby="how-title" data-testid="alerts-info">
        <Eyebrow>
          <span id="how-title">How squad alerts work</span>
        </Eyebrow>
        <ul className="mt-3 space-y-2.5 text-[14px] leading-snug">
          <li>
            <b>Squad activity</b> comes as one alert a minute or so after cases are added, naming who added them.
          </li>
          <li>
            <b>Milestones</b> (first case, halfway, 75%, target) and one <b>“so close”</b> rally near the target.
          </li>
          <li>
            <b>Weekly recap</b> {RECAP_LABEL}, when the squad added cases that week.
          </li>
          <li>
            <b>Quiet hours</b> {QUIET_HOURS_LABEL}: nothing is sent overnight; it waits until morning.
          </li>
        </ul>
      </Card>
    </AppShell>
  );
}
