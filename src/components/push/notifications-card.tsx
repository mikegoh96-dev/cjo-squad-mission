"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { disablePush, enablePush } from "@/app/(dashboard)/push-actions";
import { linkDevice, saveDevicePrefs } from "@/app/(dashboard)/squad-actions";
import { Bell3D } from "@/components/art/objects";
import { BellIcon, ChevronDownIcon, GearIcon, ShareIcon } from "@/components/icons";
import { Decor } from "@/components/ui";
import { getMe, setMe, useMe } from "@/lib/me";
import { type DevicePrefs, type DeviceSettings, fetchDeviceSettings } from "@/lib/notify-client";
import { type PushSupport, pushSupport, registerServiceWorker, vapidKeyBytes } from "@/lib/push/client";
import { QUIET_HOURS_LABEL, RECAP_LABEL } from "@/lib/push/policy";

type View = "checking" | "hidden" | "off" | "working" | "on" | "blocked" | "error";

// Browser capability never changes while the page is open.
const noSubscribe = () => () => {};
const serverSupport = (): PushSupport => "unsupported";

/**
 * Opt in to push notifications on this phone (squad activity, milestones,
 * weekly recap, and this phone's member's check-in reminders), then choose
 * which ones. iPhone: only apps added to the Home Screen can get
 * notifications, so it shows how to install first. The phone is anonymous
 * unless someone picks "Which card is yours?" (routing only, not identity).
 */
export function NotificationsCard({
  vapidPublicKey,
  memberNames,
}: {
  vapidPublicKey: string | null;
  memberNames: Record<string, string>;
}) {
  const support = useSyncExternalStore(noSubscribe, pushSupport, serverSupport);
  const [view, setView] = useState<View>("checking");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  // null = not loaded or the V2 settings aren't available (then hidden).
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const me = useMe();
  const endpoint = view === "on" ? (subscription?.endpoint ?? null) : null;

  // Load this phone's settings once notifications are on.
  useEffect(() => {
    if (!endpoint) return;
    let cancelled = false;
    void fetchDeviceSettings(endpoint).then((found) => {
      if (cancelled || !found || found === "off") return;
      // Storage was cleared but the phone was linked before: remember it again.
      if (found.memberId && getMe() === null) setMe(found.memberId);
      setSettings(found);
    });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  // Keep the server's link (where reminders go) in step with "Which card is yours?".
  const linked = settings?.memberId ?? null;
  useEffect(() => {
    if (!endpoint || !settings || linked === me) return;
    let cancelled = false;
    linkDevice(endpoint, me)
      .catch(() => null)
      .then((result) => {
        if (!cancelled && result?.ok) setSettings((s) => (s ? { ...s, memberId: me } : s));
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, settings, linked, me]);

  async function changePref(key: keyof DevicePrefs, value: boolean) {
    if (!endpoint || !settings) return;
    const previous = settings.prefs;
    const prefs = { ...previous, [key]: value };
    setSettings({ ...settings, prefs });
    const result = await saveDevicePrefs(endpoint, prefs).catch(() => null);
    if (!result?.ok) setSettings((s) => (s ? { ...s, prefs: previous } : s));
  }

  useEffect(() => {
    if (!vapidPublicKey || support !== "supported") return;
    let cancelled = false;
    registerServiceWorker()
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (cancelled) return;
        if (sub && Notification.permission === "granted") {
          setSubscription(sub);
          setView("on");
          void enablePush(sub.toJSON(), { welcome: false }); // keep the server's copy fresh
        } else {
          setView(Notification.permission === "denied" ? "blocked" : "off");
        }
      })
      .catch(() => !cancelled && setView("hidden"));
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey, support]);

  async function turnOn() {
    if (!vapidPublicKey) return;
    setView("working");
    try {
      // Must run straight from the tap (iOS asks only on a user gesture).
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setView(permission === "denied" ? "blocked" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes(vapidPublicKey) }));
      const result = await enablePush(sub.toJSON(), { welcome: true });
      if (!result.ok) {
        await sub.unsubscribe().catch(() => {});
        return setView("error");
      }
      setSubscription(sub);
      setView("on");
    } catch {
      setView("error");
    }
  }

  async function turnOff() {
    if (!subscription) return setView("off");
    setView("working");
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe().catch(() => {});
    await disablePush(endpoint).catch(() => {});
    setSubscription(null);
    setSettings(null);
    setView("off");
  }

  if (!vapidPublicKey || support === "unsupported") return null;
  if (support === "ios-install") return <InstallSteps />;
  if (view === "checking" || view === "hidden") return null;

  if (view === "on") {
    return (
      <>
        <div data-testid="push-card" data-state="on" className="rounded-tile bg-surface px-4 py-3 shadow-tile">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-good-soft text-good-text">
              <BellIcon className="size-[18px]" />
            </span>
            <p className="min-w-0 flex-1 text-[14px] font-semibold">
              Notifications on
              <span className="block text-[12px] font-medium text-muted">Quiet {QUIET_HOURS_LABEL}: alerts wait until morning</span>
            </p>
            <button type="button" onClick={turnOff} className="min-h-11 shrink-0 px-2 text-[13px] font-bold text-muted underline-offset-2 hover:underline">
              Turn off
            </button>
          </div>
        </div>
        {settings ? (
          <section data-testid="settings-card" aria-labelledby="settings-title" className="rounded-card bg-surface p-5 shadow-card">
            <h2 id="settings-title" className="flex items-center gap-2 text-[17px] font-extrabold">
              <GearIcon className="size-5 text-accent" />
              Settings
            </h2>
            <details className="group mt-3 rounded-tile bg-background/60 px-4" data-testid="push-settings">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
                  <BellIcon className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold">Notification alerts</span>
                  <span className="block text-[12px] font-medium text-muted">
                    {Object.values(settings.prefs).filter(Boolean).length} of 4 on · quiet {QUIET_HOURS_LABEL}
                  </span>
                </span>
                <ChevronDownIcon className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <ul className="space-y-1 border-t border-hairline pt-1 pb-2">
                <Toggle label="Squad activity" hint="New cases, grouped into one alert" checked={settings.prefs.activity} onChange={(v) => changePref("activity", v)} />
                <Toggle label="Milestones & rally" hint="Halfway, almost there, target hit" checked={settings.prefs.milestones} onChange={(v) => changePref("milestones", v)} />
                <Toggle
                  label="My check-in reminders"
                  hint={me && memberNames[me] ? `Only to this phone, for ${memberNames[me]}` : "Pick your card in Check-in first"}
                  checked={settings.prefs.reminders && Boolean(me)}
                  disabled={!me}
                  onChange={(v) => changePref("reminders", v)}
                />
                <Toggle label="Weekly recap" hint={RECAP_LABEL} checked={settings.prefs.recap} onChange={(v) => changePref("recap", v)} />
              </ul>
              <p className="pb-3 text-[12px] font-medium text-muted">Alerts wait until 8am during quiet hours ({QUIET_HOURS_LABEL}, Singapore time).</p>
            </details>
          </section>
        ) : null}
      </>
    );
  }

  return (
    <section
      data-testid="push-card"
      data-state={view}
      aria-labelledby="push-title"
      className="relative isolate rounded-card bg-surface p-5 shadow-card"
    >
      <Decor radius="card">
        <span className="absolute -top-16 -right-14 size-48 rounded-full bg-[radial-gradient(circle,var(--accent-soft),transparent_70%)]" />
      </Decor>
      <div className="flex items-start gap-3">
        <Bell3D className={`size-16 shrink-0 ${view === "off" ? "animate-float" : ""}`} muted={view === "blocked"} />
        <div className="min-w-0">
          <h2 id="push-title" className="text-[17px] leading-snug font-extrabold">
            Never miss a squad win
          </h2>
          <p className="mt-1 text-[14px] leading-snug text-muted">
            {view === "blocked"
              ? "Notifications are blocked for this app. Allow them in your phone's Settings, then come back."
              : `A buzz when the squad adds cases or hits a milestone, plus a Monday recap. Quiet ${QUIET_HOURS_LABEL}.`}
          </p>
        </div>
      </div>

      {view === "blocked" ? null : (
        <>
          <button
            type="button"
            onClick={turnOn}
            disabled={view === "working"}
            className="btn-3d btn-3d-brand mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-extrabold disabled:opacity-70"
          >
            {view === "working" ? (
              "Turning on…"
            ) : (
              <>
                <BellIcon className="size-5" />
                Turn on notifications
              </>
            )}
          </button>
          {view === "error" ? (
            <p role="alert" className="mt-2 text-center text-[13px] font-semibold text-danger-text">
              Couldn&apos;t turn them on. Please try again.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="flex min-h-11 w-full items-center gap-3 py-1.5 text-left disabled:opacity-60"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">{label}</span>
          <span className="block text-[12px] font-medium text-muted">{hint}</span>
        </span>
        <span
          aria-hidden="true"
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-brand" : "bg-accent-track"}`}
        >
          <span
            className={`absolute top-0.5 size-6 rounded-full bg-white shadow-tile transition-transform duration-200 ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`}
          />
        </span>
      </button>
    </li>
  );
}

/** iPhone in Safari: notifications need the app on the Home Screen first. */
function InstallSteps() {
  return (
    <section
      data-testid="push-card"
      data-state="ios-install"
      aria-labelledby="push-title"
      className="relative isolate rounded-card bg-surface p-5 shadow-card"
    >
      <Decor radius="card">
        <span className="absolute -top-16 -right-14 size-48 rounded-full bg-[radial-gradient(circle,var(--accent-soft),transparent_70%)]" />
      </Decor>
      <div className="flex items-start gap-3">
        <Bell3D className="animate-float size-16 shrink-0" />
        <div className="min-w-0">
          <h2 id="push-title" className="text-[17px] leading-snug font-extrabold">
            Get squad alerts on your iPhone
          </h2>
          <p className="mt-1 text-[14px] leading-snug text-muted">
            A buzz whenever someone adds a case. iPhone needs the app on your Home Screen first:
          </p>
        </div>
      </div>
      <ol className="mt-4 space-y-2 text-[14px] font-semibold" data-testid="ios-steps">
        <Step n={1}>
          Tap <ShareIcon className="mx-0.5 inline size-[18px] -translate-y-0.5 text-accent" /> Share in Safari
        </Step>
        <Step n={2}>Choose &ldquo;Add to Home Screen&rdquo;</Step>
        <Step n={3}>Open CJO Squad from your Home Screen and tap &ldquo;Turn on notifications&rdquo;</Step>
      </ol>
    </section>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-extrabold text-accent-strong">
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

