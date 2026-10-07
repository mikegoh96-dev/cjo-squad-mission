// Browser push services we send to (mirrors private.is_push_endpoint in the
// database). The server only ever POSTs to these hosts.
const PUSH_ENDPOINT =
  /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)\//;

export function isPushEndpoint(value: unknown): value is string {
  return typeof value === "string" && value.length <= 1000 && PUSH_ENDPOINT.test(value);
}
