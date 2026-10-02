/** Update-link tokens are 256-bit random values encoded as 64 lowercase hex chars. */
const UPDATE_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Cheap shape check before any database call. Passing it does NOT mean the
 * token is valid: only the database (hash lookup) decides that.
 */
export function isWellFormedUpdateToken(value: unknown): value is string {
  return typeof value === "string" && UPDATE_TOKEN_PATTERN.test(value);
}
