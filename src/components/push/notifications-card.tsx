"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { disablePush, enablePush } from "@/app/(dashboard)/push-actions";
import { Bell3D } from "@/components/art/objects";
import { BellIcon, ShareIcon } from "@/components/icons";
import { Decor } from "@/components/ui";
import { type PushSupport, pushSupport, registerServiceWorker, setOwnPushEndpoint, vapidKeyBytes } from "@/lib/push/client";

type View = "checking" | "hidden" | "off" | "working" | "on" | "blocked" | "error";

// Browser capability never changes while the page is open.
const noSubscribe = () => () => {};
const serverSupport = (): PushSupport => "unsupported";

/**
 * Opt in to push notifications on this phone ("someone added cases").
 * iPhone: only apps added to the Home Screen can get notifications, so it
 * shows how to install first. Anonymous: the phone is not tied to a member.
 */
export function NotificationsCard({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const support = useSyncExternalStore(noSubscribe, pushSupport, serverSupport);
  const [view, setView] = useState<View>("checking");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    if (!vapidPublicKey || support !== "supported") return;
    let cancelled = false;
    registerServiceWorker()
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (cancelled) return;
        if (sub && Notification.permission === "granted") {
          setSubscription(sub);
          setOwnPushEndpoint(sub.endpoint);
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
      setOwnPushEndpoint(sub.endpoint);
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
    setOwnPushEndpoint(null);
    setView("off");
  }

  if (!vapidPublicKey || support === "unsupported") return null;
  if (support === "ios-install") return <InstallSteps />;
  if (view === "checking" || view === "hidden") return null;

  if (view === "on") {
    return (
      <div
        data-testid="push-card"
        data-state="on"
        className="flex items-center gap-3 rounded-tile bg-surface px-4 py-3 shadow-tile"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-good-soft text-good-text">
          <BellIcon className="size-[18px]" />
        </span>
        <p className="min-w-0 flex-1 text-[14px] font-semibold">
          Notifications on
          <span className="block text-[12px] font-medium text-muted">You&apos;ll hear when the squad adds cases</span>
        </p>
        <button type="button" onClick={turnOff} className="shrink-0 px-2 py-2 text-[13px] font-bold text-muted underline-offset-2 hover:underline">
          Turn off
        </button>
      </div>
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
              : "A buzz on your phone whenever someone adds a case or the squad hits a milestone."}
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

