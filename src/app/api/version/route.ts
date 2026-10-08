// The version of the app the server is running now (see APP_VERSION in
// next.config.ts). Open apps poll this to notice a new deployment.
export function GET() {
  return Response.json(
    { version: process.env.APP_VERSION ?? null },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
