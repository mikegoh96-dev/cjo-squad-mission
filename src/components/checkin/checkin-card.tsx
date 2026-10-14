"use client";

import { useEffect, useRef, useState } from "react";
import { confirmCheckin } from "@/app/(dashboard)/squad-actions";
import { Star3D } from "@/components/art/objects";
import { CheckIcon } from "@/components/icons";
import { useOptionalLiveBoard } from "@/components/squad/live-board";
import { Avatar, Decor } from "@/components/ui";
import { setMe, useMe } from "@/lib/me";
import { type Checkin, fetchCheckin } from "@/lib/notify-client";
import { pluralCases } from "@/lib/mission";

export type CheckinMember = { id: string; name: string; initials: string };

type Load =
  | { state: "loading" }
  | { state: "off" } // feature not available (migration not applied) or no open month
  | { state: "ready"; forId: string; checkin: Checkin };

/**
 * Monthly check-in for THIS phone's member only: "Is 3 right for October?
 * Confirm" (zero allowed). Nothing here lists who has or hasn't checked in.
 * Picking a name is remembered on this phone (and routes that member's
 * private reminders to it); it is not a login.
 */
export function CheckinCard({ members, monthLabel }: { members: CheckinMember[]; monthLabel: string }) {
  const board = useOptionalLiveBoard();
  const meId = useMe();
  const me = members.find((m) => m.id === meId) ?? null;
  const [picking, setPicking] = useState(false);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  // Probe with this phone's member, or any member just to learn whether
  // check-ins are on (the answer for another member is never shown).
  const probeId = me?.id ?? members[0]?.id ?? null;
  useEffect(() => {
    if (!probeId) return;
    let cancelled = false;
    void fetchCheckin(probeId).then((checkin) => {
      if (cancelled) return;
      setLoad(checkin && checkin !== "off" ? { state: "ready", forId: probeId, checkin } : { state: "off" });
    });
    return () => {
      cancelled = true;
    };
  }, [probeId]);

  // Opened from a reminder (/?checkin=1): bring the card into view.
  useEffect(() => {
    if (load.state !== "ready") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkin") !== "1") return;
    params.delete("checkin");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    ref.current?.setAttribute("data-glow", "");
  }, [load.state]);

  if (load.state !== "ready" || !board?.editable) return null;

  const showPicker = !me || picking;
  const count = me ? (board.counts[me.id] ?? 0) : 0;
  const saving = me ? count !== (board.serverCounts[me.id] ?? 0) : false;
  // Only ever show the check-in that was loaded for THIS phone's member.
  if (me && !showPicker && load.forId !== me.id) return null;
  const checkin = me && load.forId === me.id ? load.checkin : null;
  const confirmed = checkin?.confirmed ?? false;
  const upToDate = confirmed && checkin?.confirmedCount === count;

  async function confirm() {
    if (!me || saving) return;
    setBusy(true);
    setNote(null);
    const result = await confirmCheckin(me.id, count).catch(() => null);
    setBusy(false);
    if (!result?.ok) return setNote("Couldn't check in just now. Please try again.");
    if (result.status === "conflict") {
      setNote(`Your card now shows ${pluralCases(result.count)}. Check it, then confirm again.`);
      return;
    }
    setLoad({
      state: "ready",
      forId: me.id,
      checkin: { month: result.month, confirmed: true, confirmedCount: result.count, confirmedAt: result.confirmedAt },
    });
    navigator.vibrate?.(12);
  }

  function choose(id: string | null) {
    setMe(id);
    setPicking(false);
    setNote(null);
  }

  return (
    <section
      ref={ref}
      id="checkin"
      data-testid="checkin-card"
      data-state={showPicker ? "pick" : upToDate ? "confirmed" : "open"}
      aria-labelledby="checkin-title"
      className="relative isolate scroll-mt-24 rounded-card bg-surface p-5 shadow-card data-glow:ring-2 data-glow:ring-accent"
    >
      <Decor radius="card">
        <span className="absolute -bottom-20 -left-16 size-48 rounded-full bg-[radial-gradient(circle,var(--accent-soft),transparent_70%)]" />
      </Decor>

      {showPicker ? (
        <>
          <div className="flex items-start gap-3">
            <Star3D className="size-14 shrink-0" />
            <div className="min-w-0">
              <h2 id="checkin-title" className="text-[17px] leading-snug font-extrabold">
                Which card is yours?
              </h2>
              <p className="mt-1 text-[14px] leading-snug text-muted">
                Check in for {monthLabel} and get your own reminders. This phone just remembers it (it isn&apos;t a login).
              </p>
            </div>
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-2 min-[480px]:grid-cols-3" aria-label="Pick your name">
            {members.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => choose(m.id)}
                  aria-pressed={m.id === meId}
                  className="btn-3d btn-3d-soft flex min-h-11 w-full items-center gap-2 rounded-btn px-2.5 py-2 text-left text-[14px] font-bold"
                >
                  <Avatar name={m.name} id={m.id} initials={m.initials} size="sm" />
                  <span className="min-w-0 truncate">{m.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {me ? (
            <div className="mt-3 flex justify-between gap-2 text-[13px] font-bold text-muted">
              <button type="button" onClick={() => setPicking(false)} className="min-h-11 px-1 underline-offset-2 hover:underline">
                Keep {me.name}
              </button>
              <button type="button" onClick={() => choose(null)} className="min-h-11 px-1 underline-offset-2 hover:underline">
                Not on this phone
              </button>
            </div>
          ) : null}
        </>
      ) : me ? (
        <>
          <div className="flex items-center gap-3">
            {upToDate ? (
              <span className="animate-pop flex size-14 shrink-0 items-center justify-center rounded-full bg-good-soft text-good-text">
                <CheckIcon className="size-7" />
              </span>
            ) : (
              <Star3D className="animate-float size-14 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold tracking-wide text-muted uppercase">{monthLabel} check-in</p>
              <h2 id="checkin-title" className="truncate text-[17px] leading-snug font-extrabold">
                {upToDate ? `Checked in, ${me.name}!` : `${me.name}, is ${count} right?`}
              </h2>
            </div>
          </div>

          <p className="mt-2 text-[14px] leading-snug text-muted" data-testid="checkin-text">
            {upToDate
              ? `You confirmed ${pluralCases(count)} for ${monthLabel}. Thanks for keeping the board accurate.`
              : confirmed
                ? `You confirmed ${pluralCases(checkin?.confirmedCount ?? 0)} earlier; your card now shows ${pluralCases(count)}.`
                : `Confirm your ${monthLabel} count so the mission board is accurate, even if it's zero.`}
          </p>

          {upToDate ? null : (
            <button
              type="button"
              onClick={confirm}
              disabled={busy || saving}
              className="btn-3d btn-3d-brand mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-btn text-[15px] font-extrabold disabled:opacity-70"
            >
              {saving ? (
                "Saving your card…"
              ) : busy ? (
                "Checking in…"
              ) : (
                <>
                  <CheckIcon className="size-5" />
                  {confirmed ? `Update to ${pluralCases(count)}` : `Confirm ${pluralCases(count)}`}
                </>
              )}
            </button>
          )}
          {note ? (
            <p role="alert" className="mt-2 text-center text-[13px] font-semibold text-danger-text">
              {note}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="mt-2 min-h-11 text-[13px] font-bold text-muted underline-offset-2 hover:underline"
          >
            Not {me.name}? Change
          </button>
        </>
      ) : null}
    </section>
  );
}
