const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns a trimmed email address, or null if the input is not one. */
export function parseEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}
