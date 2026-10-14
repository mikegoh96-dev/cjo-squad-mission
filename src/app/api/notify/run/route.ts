import { createHash, timingSafeEqual } from "node:crypto";
import { runNotifications } from "@/lib/push/server";

// Called every minute by Supabase Cron (pg_cron + pg_net) with
// "Authorization: Bearer <CRON_SECRET>". Plans and sends due notifications in
// bounded batches; overlapping calls are safe (claims are atomic in the DB).
// Without CRON_SECRET the endpoint stays closed.
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const given = request.headers.get("authorization") ?? "";
  // Compare fixed-length digests in constant time.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }
  try {
    const result = await runNotifications();
    return Response.json(result, { headers });
  } catch (error) {
    console.error("notify: run failed", (error as { code?: string }).code ?? error);
    return Response.json({ error: "run failed" }, { status: 500, headers });
  }
}
