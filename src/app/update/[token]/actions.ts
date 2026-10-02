"use server";

import { submitCaseCount } from "@/lib/data/update-link";
import { parseCaseCount } from "@/lib/validation/case-count";

export type SaveState =
  | { status: "idle" }
  | { status: "saved"; caseCount: number }
  | { status: "error"; message: string };

const MESSAGES = {
  "invalid-link": "This update link is no longer valid. Ask your squad admin for a new one.",
  "no-open-month": "There is no campaign month open right now.",
  "invalid-count": "Enter a whole number of cases.",
  unavailable: "Couldn't save right now. Please try again.",
} as const;

/**
 * Saves the link owner's CURRENT total. Only `token` and `caseCount` are read
 * from the form; the member is derived server-side from the token.
 */
export async function saveCaseCount(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const parsed = parseCaseCount(formData.get("caseCount"));
  if (!parsed.ok) return { status: "error", message: parsed.error };

  const token = formData.get("token");
  if (typeof token !== "string") return { status: "error", message: MESSAGES["invalid-link"] };

  const result = await submitCaseCount(token, parsed.value);
  if (!result.ok) return { status: "error", message: MESSAGES[result.reason] };
  return { status: "saved", caseCount: result.caseCount };
}
