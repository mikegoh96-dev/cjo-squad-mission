// Avatar initials that stay distinguishable within a squad (pure, unit tested).

const VOWELS = new Set(["A", "E", "I", "O", "U", "Y"]);

/** Candidate initials for one name, most natural first. */
function candidates(name: string): string[] {
  const words = name.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ["?"];
  const first = words[0];
  const out: string[] = [];
  if (words.length > 1) {
    const last = words[words.length - 1];
    out.push(first[0] + last[0]);
    for (const ch of last.slice(1)) out.push(first[0] + ch);
  } else if (first.length <= 2) {
    out.push(first); // "KJ" stays "KJ"
  } else {
    // First letter + first consonant after it: Jenny -> JN, Jessica -> JS, Marcus -> MR.
    const consonant = [...first.slice(1)].find((ch) => /[A-Z]/.test(ch) && !VOWELS.has(ch));
    if (consonant) out.push(first[0] + consonant);
  }
  for (const ch of first.slice(1)) out.push(first[0] + ch);
  return [...new Set(out.filter((c) => c.length > 0))];
}

/** Natural initials for a single name (no squad context). */
export function initialsFor(name: string): string {
  return candidates(name)[0];
}

/**
 * Initials per person, unique within the group whenever the names allow it.
 * Deterministic: people are resolved in name order, each taking their first
 * candidate not already used.
 */
export function uniqueInitials(people: Array<{ id: string; name: string }>): Map<string, string> {
  const taken = new Set<string>();
  const result = new Map<string, string>();
  const ordered = [...people].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  for (const p of ordered) {
    const options = candidates(p.name);
    const pick = options.find((c) => !taken.has(c)) ?? options[0];
    taken.add(pick);
    result.set(p.id, pick);
  }
  return result;
}
