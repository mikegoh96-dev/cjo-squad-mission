import assert from "node:assert/strict";
import { test } from "node:test";
import { deliver, type PushDevice } from "./deliver.ts";
import { isPushEndpoint } from "./endpoint.ts";
import { casesAddedMessage, welcomeMessage } from "./message.ts";

const base = { squadMemberId: "m1", name: "Cynthia", target: 20, monthLabel: "October" };

test("a case added: credits the person, headline is the squad's progress", () => {
  assert.deepEqual(casesAddedMessage({ ...base, added: 1, squadTotal: 5 }), {
    title: "🎉 Cynthia added a case",
    body: "Squad: 5 / 20 for October · 15 cases to go",
    tag: "member-m1",
    url: "/",
  });
  assert.equal(casesAddedMessage({ ...base, added: 2, squadTotal: 7 }).title, "🎉 Cynthia added 2 cases");
  assert.equal(casesAddedMessage({ ...base, added: 1, squadTotal: 19 }).body, "Squad: 19 / 20 for October · 1 case to go");
});

test("crossing a milestone gets a milestone headline", () => {
  const half = casesAddedMessage({ ...base, added: 2, squadTotal: 11 });
  assert.equal(half.title, "🏅 Halfway there!");
  assert.equal(half.body, "Cynthia added 2 cases. Squad: 11 / 20 for October · 9 cases to go");
  assert.equal(half.tag, "milestone-halfway");
  assert.equal(casesAddedMessage({ ...base, added: 1, squadTotal: 1 }).title, "⭐ Mission started!");
  assert.equal(casesAddedMessage({ ...base, added: 1, squadTotal: 15 }).title, "⚡ Momentum!");
  const cleared = casesAddedMessage({ ...base, added: 3, squadTotal: 21 });
  assert.equal(cleared.title, "🏆 October cleared!");
  assert.match(cleared.body, /target hit! 🎯$/);
});

test("saves landing together: the exact before-total decides the milestone", () => {
  // Two +1 saves for the same person land together; both read squad total 2.
  const first = casesAddedMessage({ ...base, added: 1, squadTotal: 2, squadBefore: 0 });
  const second = casesAddedMessage({ ...base, added: 1, squadTotal: 2, squadBefore: 1 });
  assert.equal(first.title, "⭐ Mission started!");
  assert.equal(first.body, "Cynthia added a case. Squad: 2 / 20 for October · 18 cases to go");
  assert.equal(second.title, "🎉 Cynthia added a case");
  // Without it, both would read before = 1 and the milestone would be missed.
  assert.equal(casesAddedMessage({ ...base, added: 1, squadTotal: 2 }).title, "🎉 Cynthia added a case");
});

test("past the target: no new milestone, still celebrates", () => {
  const m = casesAddedMessage({ ...base, added: 1, squadTotal: 25 });
  assert.equal(m.title, "🎉 Cynthia added a case");
  assert.equal(m.body, "Squad: 25 / 20 for October · target hit! 🎯");
});

test("welcome message", () => {
  assert.equal(welcomeMessage().title, "🔔 Notifications are on");
});

test("only known browser push services are allowed", () => {
  assert.ok(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"));
  assert.ok(isPushEndpoint("https://web.push.apple.com/QGx"));
  assert.ok(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x"));
  assert.ok(isPushEndpoint("https://wns2-sg2p.notify.windows.com/w/?token=x"));
  assert.ok(!isPushEndpoint("https://evil.example.com/fcm.googleapis.com/"));
  assert.ok(!isPushEndpoint("https://fcm.googleapis.com.evil.com/x"));
  assert.ok(!isPushEndpoint("http://fcm.googleapis.com/fcm/send/abc"));
  assert.ok(!isPushEndpoint("https://localhost/x"));
  assert.ok(!isPushEndpoint(42));
});

const device = (id: string): PushDevice => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: "k", auth: "a" });

test("delivers to every device except the sender's, and forgets gone devices", async () => {
  const sentTo: string[] = [];
  let forgotten: string[] = [];
  const report = await deliver(
    welcomeMessage(),
    {
      list: async () => [device("a"), device("b"), device("me"), device("gone"), device("down"), { ...device("x"), endpoint: "https://evil.example.com/x" }],
      send: async (d, payload) => {
        assert.equal(JSON.parse(payload).title, "🔔 Notifications are on");
        if (d.endpoint.endsWith("gone")) throw { statusCode: 410 };
        if (d.endpoint.endsWith("down")) throw { statusCode: 503 };
        sentTo.push(d.endpoint.split("/").at(-1)!);
      },
      forget: async (endpoints) => {
        forgotten = endpoints;
      },
    },
    { exceptEndpoint: device("me").endpoint },
  );
  assert.deepEqual(sentTo.sort(), ["a", "b"]);
  assert.deepEqual(forgotten, [device("gone").endpoint]);
  assert.deepEqual(report, { sent: 2, failed: 2, forgotten: 1 });
});

test("no devices: nothing sent, nothing forgotten", async () => {
  let forgetCalled = false;
  const report = await deliver(welcomeMessage(), {
    list: async () => [],
    send: async () => assert.fail("must not send"),
    forget: async () => {
      forgetCalled = true;
    },
  });
  assert.deepEqual(report, { sent: 0, failed: 0, forgotten: 0 });
  assert.equal(forgetCalled, false);
});
