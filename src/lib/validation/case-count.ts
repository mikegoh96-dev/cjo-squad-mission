/**
 * Upper bound for a member's monthly case count. Must match the
 * `case_count between 0 and 1000` check in supabase/migrations.
 */
export const MAX_CASE_COUNT = 1000;

export type CaseCountResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * Validates user input for a monthly case count: a whole number from 0 to
 * MAX_CASE_COUNT, given as a number or a plain digit string (e.g. form data).
 * The database enforces the same rules; this gives users a clear message first.
 */
export function parseCaseCount(input: unknown): CaseCountResult {
  let value: number;

  if (typeof input === "number") {
    value = input;
  } else if (typeof input === "string" && /^\d{1,4}$/.test(input.trim())) {
    value = Number(input.trim());
  } else {
    return { ok: false, error: "Enter a whole number of cases." };
  }

  if (!Number.isInteger(value)) {
    return { ok: false, error: "Enter a whole number of cases." };
  }
  if (value < 0 || value > MAX_CASE_COUNT) {
    return {
      ok: false,
      error: `Case count must be between 0 and ${MAX_CASE_COUNT}.`,
    };
  }
  return { ok: true, value };
}
