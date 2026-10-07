// Sends one message to every opted-in device (pure orchestration; the web-push
// and database calls are injected so this is unit-testable).
import { isPushEndpoint } from "./endpoint.ts";
import type { PushMessage } from "./message.ts";

export type PushDevice = { endpoint: string; p256dh: string; auth: string };

export type DeliverDeps = {
  list: () => Promise<PushDevice[]>;
  /** Resolves on success; rejects with { statusCode } from the push service. */
  send: (device: PushDevice, payload: string) => Promise<unknown>;
  forget: (endpoints: string[]) => Promise<unknown>;
};

export type DeliverReport = { sent: number; failed: number; forgotten: number };

/** Push services answer 404/410 when a device unsubscribed or expired. */
const GONE = new Set([404, 410]);

export async function deliver(
  message: PushMessage,
  deps: DeliverDeps,
  options: { exceptEndpoint?: string | null } = {},
): Promise<DeliverReport> {
  const devices = (await deps.list()).filter(
    (d) => isPushEndpoint(d.endpoint) && d.endpoint !== options.exceptEndpoint,
  );
  const payload = JSON.stringify(message);
  const results = await Promise.allSettled(devices.map((d) => deps.send(d, payload)));

  const gone: string[] = [];
  let sent = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") sent += 1;
    else if (GONE.has((r.reason as { statusCode?: number } | null)?.statusCode ?? 0)) gone.push(devices[i].endpoint);
  });
  if (gone.length) await deps.forget(gone);
  return { sent, failed: results.length - sent, forgotten: gone.length };
}
