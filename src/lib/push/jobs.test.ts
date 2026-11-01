import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyPushError, type ClaimedJob, joinNames, renderJob, runJobs, ttlSeconds } from "./jobs.ts";

const oct = { month: "2026-10-01", target: 20 };

test("names are joined A-Z as given, never with numbers", () => {
  assert.equal(joinNames(["Ben"]), "Ben");
  assert.equal(joinNames(["Ben", "Daniel"]), "Ben and Daniel");
  assert.equal(joinNames(["Aisha", "Ben", "Daniel"]), "Aisha, Ben and Daniel");
  assert.equal(joinNames(["A", "B", "C", "D", "E", "F"]), "A, B, C and 3 more");
});

test("activity: one consolidated alert naming contributors, squad progress only", () => {
  const m = renderJob("activity", { ...oct, total: 12, names: ["Ben", "Daniel"], covered: false });
  assert.deepEqual(m, {
    title: "🚀 The squad is moving!",
    body: "New cases from Ben and Daniel. Squad: 12 / 20 for October · 8 cases to go",
    tag: "squad-activity",
    url: "/",
  });
  assert.doesNotMatch(m.body, /Ben \d|Daniel \d/, "no individual totals");
  assert.match(renderJob("activity", { ...oct, total: 21, names: ["Marcus"] }).body, /target hit! 🎯$/);
});

test("milestones use the in-app labels and open the Mission screen", () => {
  const half = renderJob("milestone", { ...oct, key: "halfway", total: 10, names: ["Daniel"] });
  assert.equal(half.title, "🏅 Halfway there!");
  assert.equal(half.body, "New cases from Daniel. Squad: 10 / 20 for October · 10 cases to go");
  assert.equal(half.tag, "milestone-halfway");
  assert.equal(half.url, "/mission");
  assert.equal(renderJob("milestone", { ...oct, key: "started", total: 1, names: [] }).title, "⭐ Mission started!");
  assert.equal(renderJob("milestone", { ...oct, key: "momentum", total: 15, names: [] }).title, "⚡ Momentum!");
  assert.equal(renderJob("milestone", { ...oct, key: "cleared", total: 20, names: [] }).title, "🏆 October cleared!");
  assert.equal(renderJob("milestone", { ...oct, key: "cleared", total: 20, names: [] }).body.startsWith("New cases just came in."), true);
});

test("rally is collective and positive", () => {
  const r = renderJob("rally", { ...oct, total: 18, names: ["Ben"] });
  assert.equal(r.title, "🔥 So close!");
  assert.equal(r.body, "The squad is 2 cases away from clearing October. One squad, one mission!");
  assert.equal(renderJob("rally", { month: "2026-11-01", target: 30, total: 29 }).body,
    "The squad is 1 case away from clearing November. One squad, one mission!");
});

test("reminder is private wording for one member and links to their check-in", () => {
  const r = renderJob("reminder", { month: "2026-11-01", name: "Ben", seq: 1 });
  assert.equal(r.title, "Quick squad check-in");
  assert.equal(r.body, "Ben, please confirm your November case count (even if it's zero) so the mission board stays accurate.");
  assert.equal(r.url, "/?checkin=1");
  assert.equal(r.tag, "checkin");
  assert.match(renderJob("reminder", { month: "2026-11-01" }).body, /^Please confirm/);
});

test("weekly recap: net cases, milestones, progress; no individuals", () => {
  const r = renderJob("recap", {
    net: 5, week_start: "2026-10-12", week_end: "2026-10-18",
    milestones: [{ key: "halfway", month: "2026-10-01" }, { key: "cleared", month: "2026-10-01" }],
    month: "2026-10-01", total: 20, target: 20,
  });
  assert.equal(r.title, "📊 Your squad's week");
  assert.equal(r.body, "+5 cases last week. Milestones: Halfway there, October cleared. October: 20 / 20 · cleared! 🎯 Amazing teamwork.");
  assert.equal(r.url, "/mission");
  const quiet = renderJob("recap", { net: 1, milestones: [], month: "2026-11-01", total: 4, target: 30 });
  assert.equal(quiet.body, "+1 case last week. November: 4 / 30 · 26 cases to go. Keep it rolling!");
});

test("malformed payloads are refused (never sent half-rendered)", () => {
  assert.throws(() => renderJob("activity", { month: "2026-10-01", names: [] }));
  assert.throws(() => renderJob("milestone", { ...oct, key: "rally", total: 1 }));
  assert.throws(() => renderJob("activity", { ...oct, month: "October", total: 1 }));
  assert.throws(() => renderJob("nope", {}));
  assert.throws(() => renderJob("recap", null));
});

test("push errors: gone, retryable, or rejected", () => {
  assert.deepEqual(classifyPushError({ statusCode: 410 }), { outcome: "gone", code: 410 });
  assert.deepEqual(classifyPushError({ statusCode: 404 }), { outcome: "gone", code: 404 });
  assert.deepEqual(classifyPushError({ statusCode: 429 }), { outcome: "retry", code: 429 });
  assert.deepEqual(classifyPushError({ statusCode: 503 }), { outcome: "retry", code: 503 });
  assert.deepEqual(classifyPushError(new Error("ETIMEDOUT")), { outcome: "retry", code: null });
  assert.deepEqual(classifyPushError({ statusCode: 400 }), { outcome: "rejected", code: 400 });
  assert.deepEqual(classifyPushError({ statusCode: 403 }), { outcome: "rejected", code: 403 });
  assert.deepEqual(classifyPushError({ statusCode: 413 }), { outcome: "rejected", code: 413 });
});

test("ttl: routine activity expires sooner than celebrations and reminders", () => {
  assert.ok(ttlSeconds("activity") < ttlSeconds("milestone"));
  assert.equal(ttlSeconds("reminder"), 12 * 3600);
});

const phone = (id: string, host = "fcm.googleapis.com") => ({
  id, endpoint: `https://${host}/fcm/send/${id}`, p256dh: "k", auth: "a",
});
const job = (jobId: number, kind: string, payload: unknown, recipients = [phone("p1")]): ClaimedJob => ({
  jobId, claimToken: `t${jobId}`, kind, payload, recipients,
});

test("runner: plans, claims, sends to every recipient, reports each result", async () => {
  const calls: string[] = [];
  const completed: Array<[number, unknown]> = [];
  const queue = [[
    job(1, "milestone", { ...oct, key: "halfway", total: 10, names: ["Daniel"] }, [phone("a"), phone("b"), phone("c")]),
    job(2, "activity", { ...oct, total: 11, names: ["Marcus"] }, [phone("a")]),
  ]];
  const report = await runJobs({
    plan: async () => calls.push("plan"),
    claim: async () => (calls.push("claim"), queue.shift() ?? []),
    send: async (r) => {
      if (r.id === "b") throw { statusCode: 410 };
      if (r.id === "c") throw { statusCode: 503 };
    },
    complete: async (j, results) => completed.push([j.jobId, results]),
  });
  assert.deepEqual(calls, ["plan", "claim"], "a short batch means the queue is empty: no second claim");
  assert.deepEqual(completed[0], [1, [
    { id: "a", outcome: "accepted", code: 201 },
    { id: "b", outcome: "gone", code: 410 },
    { id: "c", outcome: "retry", code: 503 },
  ]]);
  assert.deepEqual(report, { jobs: 2, accepted: 2, retry: 1, gone: 1, rejected: 0, byKind: { milestone: 1, activity: 1 } });
});

test("runner: the originating phone is not filtered out (no exceptEndpoint)", async () => {
  const sentTo: string[] = [];
  await runJobs({
    plan: async () => {},
    claim: async () => [],
    send: async () => {},
    complete: async () => {},
  });
  const one = [job(1, "activity", { ...oct, total: 3, names: ["Marcus"] }, [phone("tapper"), phone("other")])];
  await runJobs({
    plan: async () => {},
    claim: async () => one.splice(0),
    send: async (r) => void sentTo.push(r.id),
    complete: async () => {},
  });
  assert.deepEqual(sentTo, ["tapper", "other"]);
});

test("runner: malformed job and unknown push hosts are rejected, never sent", async () => {
  const sent: string[] = [];
  const results: unknown[] = [];
  const jobs = [
    job(1, "activity", { broken: true }, [phone("a")]),
    job(2, "activity", { ...oct, total: 3, names: [] }, [{ ...phone("x"), endpoint: "https://evil.example/x" }]),
  ];
  await runJobs({
    plan: async () => {},
    claim: async () => jobs.splice(0),
    send: async (r) => void sent.push(r.id),
    complete: async (_j, r) => void results.push(r),
  });
  assert.deepEqual(sent, []);
  assert.deepEqual(results, [[{ id: "a", outcome: "rejected", code: null }], [{ id: "x", outcome: "rejected", code: null }]]);
});

test("runner: keeps claiming full batches, stops at the time budget", async () => {
  let t = 0;
  let claims = 0;
  const report = await runJobs(
    {
      plan: async () => {},
      claim: async (limit) => {
        claims += 1;
        return Array.from({ length: limit }, (_, i) => job(claims * 100 + i, "activity", { ...oct, total: 1, names: [] }));
      },
      send: async () => {},
      complete: async () => {},
      now: () => (t += 1000),
    },
    { batch: 2, budgetMs: 5000 },
  );
  assert.ok(claims >= 2 && claims <= 5, `claims ${claims}`);
  assert.equal(report.jobs, claims * 2);
});

// ---------------------------------------------------------------------------
// PC$ challenge
// ---------------------------------------------------------------------------
const pc = { month: "2026-11-01", target: 120000, minimum: 5000, total: 85000, everyone_minimum: false, minimum_reached: [], target_reached: false };
const upd = (name: string, old: number | null, next: number) => ({ id: `id-${name}`, name, old, new: next });

test("PC$ update: one member's new cumulative amount and the squad total, no editor or pronoun claimed", () => {
  const m = renderJob("pc_activity", { ...pc, updates: [upd("Chloe", 6000, 8000)] });
  assert.deepEqual(m, {
    title: "💰 PC$ UPDATE!",
    body: "Chloe's November production is now $8,000. Squad progress: $85,000 / $120,000.",
    tag: "pc-update",
    url: "/",
  });
  assert.doesNotMatch(m.body, /\b(her|his|their|just updated)\b/);
  assert.equal(renderJob("pc_activity", { ...pc, updates: [upd("Chloe", null, 8000)] }).title, "💰 PC$ UPDATE!", "a first entry");
});

test("PC$ correction: a lower amount is a correction, never new production", () => {
  const m = renderJob("pc_activity", { ...pc, total: 84500, updates: [upd("Chloe", 8000, 7500)] });
  assert.equal(m.title, "✏️ PC$ CORRECTION");
  assert.equal(m.body, "Chloe's November production was corrected to $7,500. Squad progress: $84,500 / $120,000.");
  assert.doesNotMatch(m.body, /now|new/i);
});

test("PC$ batch: one consolidated notification listing every member", () => {
  const m = renderJob("pc_activity", { ...pc, updates: [upd("Ben", null, 3500), upd("Chloe", 8000, 7500), upd("Daniel", 1000, 2000)] });
  assert.equal(m.title, "💰 PC$ UPDATE!");
  assert.equal(m.body, "November production: Ben $3,500, Chloe $7,500 (corrected), Daniel $2,000. Squad progress: $85,000 / $120,000.");
  const all = renderJob("pc_activity", { ...pc, updates: [upd("Ben", 4000, 3500), upd("Chloe", 8000, 7500)] });
  assert.equal(all.title, "✏️ PC$ CORRECTION");
  assert.equal(all.body, "November production corrected: Ben $3,500, Chloe $7,500. Squad progress: $85,000 / $120,000.");
  const many = renderJob("pc_activity", { ...pc, updates: ["A", "B", "C", "D", "E", "F", "G"].map((n) => upd(n, null, 1000)) });
  assert.match(many.body, /^November production: A \$1,000, B \$1,000, C \$1,000, D \$1,000, E \$1,000 and 2 more\./);
});

test("PC$ minimum reached: special title naming who reached it, with the update and squad total", () => {
  const m = renderJob("pc_milestone", { ...pc, minimum_reached: ["Chloe"], updates: [upd("Chloe", 4000, 8000)] });
  assert.equal(m.title, "✅ MINIMUM PC$ ACHIEVED!");
  assert.equal(
    m.body,
    "Chloe has reached the individual $5,000 requirement! Chloe's November production is now $8,000. Squad progress: $85,000 / $120,000.",
  );
  assert.equal(m.url, "/mission");
  assert.match(renderJob("pc_milestone", { ...pc, minimum_reached: ["Ben", "Chloe"], updates: [upd("Ben", 0, 5000), upd("Chloe", 1, 6000)] }).body, /^Ben and Chloe have reached/);
});

test("PC$ squad target: announced without implying any reward is confirmed", () => {
  const m = renderJob("pc_milestone", {
    ...pc, total: 183500, target_reached: true, minimum_reached: ["Daniel"], updates: [upd("Daniel", 2000, 15000)],
  });
  assert.equal(m.title, "🏆 SQUAD PC$ TARGET ACHIEVED!");
  assert.equal(
    m.body,
    "Your squad has reached $120,000! Squad total: $183,500. Daniel has reached the $5,000 minimum. Next: every member needs at least $5,000. Daniel's November production is now $15,000.",
  );
  assert.doesNotMatch(m.body, /iphone|reward|prize|won|confirmed|qualif/i);
  const all = renderJob("pc_milestone", { ...pc, total: 190000, target_reached: true, everyone_minimum: true, updates: [upd("Ben", 100, 200)] });
  assert.match(all.body, /Every member is at the \$5,000 minimum too\./);
});

test("PC$ malformed payloads are refused", () => {
  assert.throws(() => renderJob("pc_activity", { ...pc, updates: [] }));
  assert.throws(() => renderJob("pc_activity", { ...pc, updates: [{ name: "Ben", old: null, new: 1.5 }] }));
  assert.throws(() => renderJob("pc_activity", { ...pc, updates: [{ name: "", old: null, new: 1 }] }));
  assert.throws(() => renderJob("pc_milestone", { ...pc, month: "nope", updates: [upd("Ben", null, 1)] }));
});

test("PC$ names are listed A–Z like the cards, case-insensitive, whatever the database order", () => {
  const m = renderJob("pc_milestone", {
    ...pc, minimum_reached: ["Marcus", "JR", "Jenny"], updates: [upd("Marcus", 0, 6000), upd("JR", 0, 6000), upd("Jenny", 0, 6000)],
  });
  assert.match(m.body, /^Jenny, JR and Marcus have reached/);
  assert.match(m.body, /November production: Jenny \$6,000, JR \$6,000, Marcus \$6,000\./);
});

test("PC$ ttl: routine updates expire like activity, milestones like celebrations", () => {
  assert.equal(ttlSeconds("pc_activity"), ttlSeconds("activity"));
  assert.equal(ttlSeconds("pc_milestone"), ttlSeconds("milestone"));
});

test("runner: a PC$ job reaches every recipient, including the phone that saved", async () => {
  const sent: Array<[string, string]> = [];
  const one = [job(7, "pc_activity", { ...pc, updates: [upd("Chloe", null, 8000)] }, [phone("saver"), phone("other")])];
  const report = await runJobs({
    plan: async () => {},
    claim: async () => one.splice(0),
    send: async (r, payload) => void sent.push([r.id, JSON.parse(payload).title]),
    complete: async () => {},
  });
  assert.deepEqual(sent, [["saver", "💰 PC$ UPDATE!"], ["other", "💰 PC$ UPDATE!"]]);
  assert.deepEqual(report.byKind, { pc_activity: 1 });
});
