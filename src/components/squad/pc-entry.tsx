"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { savePcAmounts } from "@/app/(dashboard)/pc-actions";
import { CheckIcon } from "@/components/icons";
import { setUnsaved } from "@/lib/app-version";
import {
  PC_MAX,
  caretAfterDigits,
  formatPc,
  formatPcDigits,
  pcChanges,
  pcDigits,
  pcDollars,
  pcDraftState,
  pcQualification,
  qualificationLabel,
} from "@/lib/pc";

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; count: number }
  | { kind: "conflict"; changes: Array<{ name: string; amount: number }> }
  | { kind: "error"; message: string };

type PcEntryState = {
  monthLabel: string;
  minimum: number;
  /** Last saved cumulative amount per member (null = no entry yet). */
  saved: Record<string, number | null>;
  /** Digits typed and not yet saved, per member (absent = untouched). */
  drafts: Record<string, string>;
  setDraft: (id: string, digits: string | undefined) => void;
  status: SaveStatus;
  unsavedCount: number;
  invalidCount: number;
  save: () => Promise<void>;
};

const Ctx = createContext<PcEntryState | null>(null);

/** PC$ entry state on the Squad page; null when no PC$ challenge is open. */
export function usePcEntry(): PcEntryState | null {
  return useContext(Ctx);
}

const storageKey = (challengeId: string) => `cjo:pc-drafts:${challengeId}`;

/**
 * Holds the squad's PC$ entries while a challenge is open: typed values stay
 * local (nothing is saved while typing) until "Save PC$ updates" sends only
 * the changed ones in one go. Unsaved values survive moving between tabs
 * (sessionStorage) and a failed save. Server refreshes update the saved
 * amounts; a field being edited keeps its typed value.
 */
export function PcEntryProvider({
  challengeId,
  monthLabel,
  minimum,
  amounts,
  names,
  children,
}: {
  challengeId: string;
  monthLabel: string;
  minimum: number;
  amounts: Record<string, number>;
  names: Record<string, string>;
  children: React.ReactNode;
}) {
  // Amounts confirmed by this screen's saves. They apply on top of the server
  // data they were saved against; newer server data (a refresh) replaces them.
  const [confirmed, setConfirmed] = useState<{
    base: Record<string, number>;
    values: Record<string, number>;
  }>({
    base: amounts,
    values: {},
  });
  const saved = useMemo(() => {
    const own = confirmed.base === amounts ? confirmed.values : {};
    const out: Record<string, number | null> = {};
    for (const id of Object.keys(names)) out[id] = own[id] ?? amounts[id] ?? null;
    return out;
  }, [names, amounts, confirmed]);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const restored = useRef(false);

  // Unsaved values from earlier on this tab (e.g. after visiting Mission).
  useEffect(() => {
    if (restored.current) return; // once per page: refreshes must not overwrite what is being typed
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = window.sessionStorage.getItem(storageKey(challengeId));
        const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        const valid = Object.fromEntries(
          Object.entries(parsed).filter(([id, v]) => id in names && typeof v === "string" && /^\d{0,9}$/.test(v)),
        ) as Record<string, string>;
        if (Object.keys(valid).length) setDrafts((prev) => ({ ...valid, ...prev }));
      } catch {}
      restored.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [challengeId, names]);
  useEffect(() => {
    if (!restored.current) return;
    try {
      const pending = Object.fromEntries(
        Object.entries(drafts).filter(([id, d]) => pcDraftState(d, saved[id] ?? null) !== "clean"),
      );
      if (Object.keys(pending).length) window.sessionStorage.setItem(storageKey(challengeId), JSON.stringify(pending));
      else window.sessionStorage.removeItem(storageKey(challengeId));
    } catch {}
  }, [drafts, saved, challengeId]);

  const setDraft = useCallback((id: string, digits: string | undefined) => {
    setDrafts((prev) => {
      if (prev[id] === digits) return prev;
      const next = { ...prev };
      if (digits === undefined) delete next[id];
      else next[id] = digits;
      return next;
    });
    setStatus((s) => (s.kind === "saved" ? { kind: "idle" } : s));
  }, []);

  const states = useMemo(
    () => Object.entries(drafts).map(([id, d]) => [id, pcDraftState(d, saved[id] ?? null)] as const),
    [drafts, saved],
  );
  const unsavedCount = states.filter(([, s]) => s === "unsaved").length;
  const invalidCount = states.filter(([, s]) => s === "too-large").length;

  // Unsaved PC$: an app update must not reload over it; warn before leaving the page.
  useEffect(() => {
    const dirty = new Set(states.filter(([, s]) => s !== "clean").map(([id]) => id));
    for (const id of Object.keys(names)) setUnsaved(`pc:${id}`, dirty.has(id));
  }, [states, names]);
  useEffect(() => () => Object.keys(names).forEach((id) => setUnsaved(`pc:${id}`, false)), [names]);
  useEffect(() => {
    if (unsavedCount === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsavedCount]);

  const busy = useRef(false);
  const save = useCallback(async () => {
    if (busy.current) return;
    const entries = pcChanges(drafts, saved);
    if (entries.length === 0) return;
    busy.current = true;
    setStatus({ kind: "saving" });
    try {
      let result: Awaited<ReturnType<typeof savePcAmounts>>;
      try {
        result = await savePcAmounts({ challengeId, entries });
      } catch {
        setStatus({
          kind: "error",
          message: "Couldn't reach the server. Your changes are kept. Try again.",
        });
        return;
      }
      if (result.status === "error") {
        setStatus({
          kind: "error",
          message:
            result.reason === "closed"
              ? `${monthLabel} PC$ entries are closed. Nothing was saved.`
              : result.reason === "invalid"
                ? "Some amounts couldn't be saved. Check them and try again."
                : "Couldn't save right now. Your changes are kept. Try again.",
        });
        return;
      }
      const sent = Object.fromEntries(entries.map((e) => [e.squadMemberId, String(e.amount)]));
      const nowConfirmed: Record<string, number> = {};
      const conflicts: Array<{ name: string; amount: number }> = [];
      for (const row of result.rows) {
        nowConfirmed[row.squadMemberId] = row.amount;
        if (row.status === "conflict")
          conflicts.push({
            name: names[row.squadMemberId] ?? "A teammate",
            amount: row.amount,
          });
      }
      setConfirmed((prev) => ({
        base: amounts,
        values: prev.base === amounts ? { ...prev.values, ...nowConfirmed } : nowConfirmed,
      }));
      // Saved values leave the drafts (unless retyped meanwhile); conflicts keep theirs to review.
      setDrafts((prev) => {
        const next = { ...prev };
        for (const row of result.rows) {
          if (row.status !== "conflict" && next[row.squadMemberId] === sent[row.squadMemberId])
            delete next[row.squadMemberId];
        }
        return next;
      });
      setStatus(
        conflicts.length ? { kind: "conflict", changes: conflicts } : { kind: "saved", count: result.rows.length },
      );
    } finally {
      busy.current = false;
    }
  }, [drafts, saved, challengeId, monthLabel, names, amounts]);

  useEffect(() => {
    if (status.kind !== "saved") return;
    const t = window.setTimeout(() => setStatus({ kind: "idle" }), 3500);
    return () => window.clearTimeout(t);
  }, [status]);

  const value = useMemo(
    () => ({
      monthLabel,
      minimum,
      saved,
      drafts,
      setDraft,
      status,
      unsavedCount,
      invalidCount,
      save,
    }),
    [monthLabel, minimum, saved, drafts, setDraft, status, unsavedCount, invalidCount, save],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** "NOVEMBER PC$" input inside a member card: cumulative amount, whole dollars. */
export function PcField({ id, name }: { id: string; name: string }) {
  const pc = usePcEntry();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  const draft = pc?.drafts[id];
  const saved = pc?.saved[id] ?? null;
  const display = draft !== undefined ? formatPcDigits(draft) : saved !== null ? formatPc(saved) : "";

  // Keep the caret after the same digit when commas appear or move.
  useLayoutEffect(() => {
    const el = input.current;
    if (caret.current === null || !el || document.activeElement !== el) return;
    const pos = caretAfterDigits(el.value, caret.current);
    caret.current = null;
    el.setSelectionRange(pos, pos);
  }, [display]);

  if (!pc) return null;
  const state = pcDraftState(draft, saved);
  const shown = draft !== undefined && draft !== "" ? Number(draft) : saved;
  const q = pcQualification(shown, pc.minimum);

  return (
    <div className="mt-2 border-t border-hairline pt-2.5" data-testid="member-pc">
      <label
        htmlFor={inputId}
        className="block text-[11px] font-extrabold tracking-[0.1em] whitespace-nowrap text-muted uppercase"
      >
        {pc.monthLabel} PC$
      </label>
      <div className="relative mt-2">
        {/* On the field's top edge (like a legend), so the label never wraps on narrow cards. */}
        {state === "unsaved" ? (
          <span
            data-testid="pc-unsaved"
            className="pointer-events-none absolute -top-2 right-2.5 z-10 inline-flex items-center gap-1 rounded-full bg-surface px-1.5 text-[10px] leading-4 font-extrabold text-warning-text"
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
            Unsaved
          </span>
        ) : null}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[16px] font-bold text-muted"
        >
          $
        </span>
        <input
          ref={input}
          id={inputId}
          type="text"
          inputMode="numeric"
          enterKeyHint="done"
          autoComplete="off"
          maxLength={11}
          placeholder="0"
          aria-label={`${pc.monthLabel} PC$ for ${name}, in dollars`}
          aria-describedby={`${inputId}-q`}
          aria-invalid={state === "too-large" || undefined}
          data-testid="pc-input"
          value={display}
          onChange={(e) => {
            const el = e.target;
            const at = el.selectionStart ?? el.value.length;
            caret.current = el.value.slice(0, at).replace(/\D/g, "").length;
            pc.setDraft(id, pcDigits(el.value));
          }}
          onBlur={() => {
            // Leaving an empty or unchanged field restores the last saved amount.
            if (draft !== undefined && pcDraftState(draft, saved) === "clean") pc.setDraft(id, undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className={`h-11 w-full min-w-0 rounded-btn bg-background pr-3 pl-7 text-[16px] font-bold tabular-nums ring-1 outline-none transition-shadow placeholder:text-muted/60 focus:ring-2 focus:ring-accent ${
            state === "too-large" ? "ring-danger-text" : state === "unsaved" ? "ring-warning-text" : "ring-hairline"
          }`}
        />
      </div>
      <p
        id={`${inputId}-q`}
        data-testid="pc-qualification"
        className="mt-1 flex min-h-4 items-center gap-1 text-[12px] leading-tight font-semibold"
      >
        {state === "too-large" ? (
          <span className="text-danger-text">Max {pcDollars(PC_MAX)}</span>
        ) : q.met ? (
          <span className="inline-flex items-center gap-1 text-good-text">
            <CheckIcon className="size-3.5 shrink-0" />
            {qualificationLabel(q)}
          </span>
        ) : (
          <span className="text-muted">{qualificationLabel(q)}</span>
        )}
      </p>
    </div>
  );
}

/** One "Save PC$ updates" button for the whole squad, below the member cards. */
export function PcSaveBar() {
  const pc = usePcEntry();
  if (!pc) return null;
  const { status, unsavedCount, invalidCount, monthLabel } = pc;
  const saving = status.kind === "saving";
  const message =
    status.kind === "error" ? (
      <span className="text-danger-text">{status.message}</span>
    ) : status.kind === "conflict" ? (
      <span className="text-warning-text">
        {status.changes
          .map((c) => `${c.name}'s PC$ was just changed on another phone to ${pcDollars(c.amount)}`)
          .join(". ")}
        . Check and save again.
      </span>
    ) : status.kind === "saved" ? (
      <span className="inline-flex items-center gap-1 text-good-text">
        <CheckIcon className="size-4" />
        PC$ saved
      </span>
    ) : saving ? (
      <span className="text-muted">Saving…</span>
    ) : invalidCount > 0 ? (
      <span className="text-danger-text">Fix the amount{invalidCount === 1 ? "" : "s"} marked in red first.</span>
    ) : unsavedCount > 0 ? (
      <span className="text-warning-text">
        {unsavedCount} unsaved PC$ {unsavedCount === 1 ? "change" : "changes"}
      </span>
    ) : (
      <span className="text-muted">Enter cumulative {monthLabel} PC$ on the cards above, then save.</span>
    );

  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="pc-save-bar">
      <button
        type="button"
        onClick={() => void pc.save()}
        disabled={saving || unsavedCount === 0 || invalidCount > 0}
        data-testid="pc-save"
        className="btn-3d btn-3d-brand flex h-12 w-full items-center justify-center gap-2 rounded-btn text-[16px] font-extrabold disabled:opacity-45"
      >
        {saving ? (
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none"
          />
        ) : null}
        {saving ? "Saving…" : unsavedCount > 0 ? `Save PC$ updates (${unsavedCount})` : "Save PC$ updates"}
      </button>
      <p
        role="status"
        aria-live="polite"
        data-testid="pc-save-status"
        className="min-h-5 px-2 text-center text-[13px] leading-snug font-semibold"
      >
        {message}
      </p>
    </div>
  );
}
