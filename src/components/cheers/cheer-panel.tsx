"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sendCheer } from "@/app/(dashboard)/squad-actions";
import { type ArtProps, Flame3D, Gem3D, Rocket3D, Star3D } from "@/components/art/objects";
import { Decor } from "@/components/ui";
import { CHEER_KEYS, type CheerKey } from "@/lib/cheers";
import { getBrowserClient } from "@/lib/supabase/browser";

const CHEERS: Record<CheerKey, { label: string; Art: (p: ArtProps) => React.ReactNode }> = {
  lets_go: { label: "Let's go!", Art: Rocket3D },
  momentum: { label: "Great momentum!", Art: Flame3D },
  got_this: { label: "We've got this!", Art: Star3D },
  one_squad: { label: "One squad, one mission!", Art: Gem3D },
};
const isCheer = (v: unknown): v is CheerKey => typeof v === "string" && v in CHEERS;

/** Keep the buttons calm between taps (the database also rate-limits). */
const COOLDOWN_MS = 2000;
const BUBBLE_MS = 2600;
const POLL_MS = 8000;

type Bubble = { key: number; cheer: CheerKey; mine: boolean; x: number };

function clientId(): string {
  const KEY = "cjo:cheer-client";
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && existing.length >= 16) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return (memoryId ??= crypto.randomUUID());
  }
}
let memoryId: string | undefined;

/**
 * Anonymous cheers everyone sees live. Never pushed, never counted per person,
 * and they don't touch case counts. Hidden until the cheers table exists.
 */
export function CheerPanel() {
  const [ready, setReady] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [cooldown, setCooldown] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [heard, setHeard] = useState("");
  const seen = useRef(new Set<number>());
  const lastId = useRef(0);
  const pendingMine = useRef<Record<string, number>>({});
  const nextKey = useRef(0);

  const pop = useCallback((cheer: CheerKey, mine: boolean) => {
    const key = (nextKey.current += 1);
    const x = 8 + Math.round(Math.random() * 60);
    setBubbles((list) => [...list.slice(-5), { key, cheer, mine, x }]);
    window.setTimeout(() => setBubbles((list) => list.filter((b) => b.key !== key)), BUBBLE_MS);
  }, []);

  // A cheer arrived (Realtime or polling).
  const receive = useCallback(
    (row: { id?: unknown; cheer?: unknown }) => {
      if (typeof row.id !== "number" || !isCheer(row.cheer) || seen.current.has(row.id)) return;
      seen.current.add(row.id);
      lastId.current = Math.max(lastId.current, row.id);
      // Our own cheer echoing back before the server answered: already shown.
      if ((pendingMine.current[row.cheer] ?? 0) > 0) {
        pendingMine.current[row.cheer] -= 1;
        return;
      }
      pop(row.cheer, false);
      setHeard(`Squad cheer: ${CHEERS[row.cheer].label}`);
    },
    [pop],
  );

  useEffect(() => {
    let cancelled = false;
    let poll: number | undefined;
    let live = false;
    const supabase = getBrowserClient();

    const fetchNew = async () => {
      const { data } = await supabase
        .from("squad_cheers")
        .select("id, cheer")
        .gt("id", lastId.current)
        .order("id")
        .limit(10);
      if (!cancelled) data?.forEach(receive);
    };
    const startPolling = () => {
      if (poll || cancelled) return;
      poll = window.setInterval(() => {
        if (document.visibilityState === "visible" && !live) void fetchNew();
      }, POLL_MS);
    };

    // Start after the newest existing cheer (old ones are not replayed).
    const channel = supabase.channel("squad-cheers");
    supabase
      .from("squad_cheers")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled || error) return; // not available yet: stay hidden
        lastId.current = data?.[0]?.id ?? 0;
        setReady(true);
        channel
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "squad_cheers" }, (p) => receive(p.new))
          .subscribe((s) => {
            live = s === "SUBSCRIBED";
            if (!live) startPolling();
          });
        window.setTimeout(() => !live && startPolling(), 6000);
      });

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [receive]);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 3500);
    return () => window.clearTimeout(t);
  }, [note]);

  async function cheer(key: CheerKey) {
    if (cooldown) return;
    setCooldown(true);
    window.setTimeout(() => setCooldown(false), COOLDOWN_MS);
    setNote(null);
    pop(key, true);
    navigator.vibrate?.(10);
    pendingMine.current[key] = (pendingMine.current[key] ?? 0) + 1;
    const result = await sendCheer(key, clientId()).catch(() => null);
    if (result?.ok && result.status === "sent") {
      if (!seen.current.has(result.id)) {
        seen.current.add(result.id);
        pendingMine.current[key] -= 1;
      }
      lastId.current = Math.max(lastId.current, result.id);
      return;
    }
    pendingMine.current[key] = Math.max(0, (pendingMine.current[key] ?? 1) - 1);
    setNote(
      result?.ok
        ? result.status === "busy"
          ? "The squad is cheering loud! Try again in a moment."
          : "Easy, champ! One cheer every couple of seconds."
        : "Couldn't send that cheer. Please try again.",
    );
  }

  if (!ready) return null;

  return (
    <section
      data-testid="cheer-panel"
      aria-labelledby="cheer-title"
      className="relative isolate rounded-card bg-surface p-5 shadow-card"
    >
      <Decor radius="card">
        <span className="absolute -top-20 -right-16 size-52 rounded-full bg-[radial-gradient(circle,var(--violet-soft),transparent_70%)]" />
      </Decor>
      <h2 id="cheer-title" className="text-[17px] leading-snug font-extrabold">
        Cheer the squad
      </h2>
      <p className="mt-0.5 text-[13px] font-medium text-muted">Everyone sees it live. No scores, just good vibes.</p>

      {/* Stage: cheers float up here (fade only with reduced motion). */}
      <div
        className="relative mt-3 h-20 rounded-tile bg-accent-soft/60 [clip-path:inset(0_round_var(--r-tile))]"
        data-testid="cheer-stage"
      >
        {bubbles.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-[13px] font-semibold text-muted">
            Squad cheers pop up here
          </p>
        ) : null}
        {bubbles.map((b) => {
          const { label, Art } = CHEERS[b.cheer];
          return (
            <span
              key={b.key}
              data-testid="cheer-bubble"
              data-mine={b.mine ? "true" : "false"}
              style={{ left: `${b.x}%` }}
              className={`animate-cheer-rise absolute bottom-2 flex max-w-[70%] items-center gap-1.5 rounded-full py-1 pr-3 pl-1.5 text-[13px] font-extrabold whitespace-nowrap shadow-tile ${
                b.mine ? "bg-brand text-white" : "bg-surface"
              }`}
            >
              <Art className="size-5 shrink-0" />
              <span className="truncate">{label}</span>
            </span>
          );
        })}
        <span className="sr-only" aria-live="polite">
          {heard}
        </span>
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-2">
        {CHEER_KEYS.map((key) => {
          const { label, Art } = CHEERS[key];
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => cheer(key)}
                disabled={cooldown}
                data-cheer={key}
                className="btn-3d btn-3d-soft flex min-h-14 w-full items-center gap-2 rounded-btn px-2.5 py-2 text-left text-[14px] leading-tight font-extrabold disabled:opacity-60"
              >
                <Art className="size-8 shrink-0" />
                <span className="min-w-0">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {note ? (
        <p role="status" className="mt-2 text-center text-[13px] font-semibold text-muted">
          {note}
        </p>
      ) : null}
    </section>
  );
}
