#!/usr/bin/env node
// Builds the sanitised starter template (for other squads) from this repo.
//
//   npm run export:starter -- <empty or new output directory>
//
// Copies every tracked file at HEAD except this squad's own data, swaps in the
// files under starter/ (placeholder squad config, README), sets the service
// worker's fallback title to the placeholder app name, then scans the result
// and fails if anything squad-specific or secret-looking is left. Never copies
// untracked files (.env.local, squad.setup.json, generated SQL).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const out = process.argv[2] ? resolve(process.argv[2]) : null;
if (!out) {
  console.error("usage: npm run export:starter -- <output directory>");
  process.exit(1);
}
if (existsSync(out) && readdirSync(out).some((f) => f !== ".git")) {
  console.error(`export-starter: ${out} must be empty (a .git folder is fine)`);
  process.exit(1);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// This squad's data and production notes: never part of the starter.
const EXCLUDE = new Set([
  "docs/PRODUCTION.md",
  "supabase/migrations/20261002035215_campaign_q4_2026.sql",
  "supabase/tests/database/06_campaign_seed.test.sql",
  "scripts/export-starter.mjs",
]);
const EXCLUDE_PREFIX = ["starter/"];

// starter/<path> replaces <path>.
const overrides = git("ls-tree", "-r", "--name-only", "HEAD", "starter/")
  .split("\n")
  .filter(Boolean)
  .map((p) => p.slice("starter/".length));

// Squad-specific or secret-looking text that must not reach the starter.
const DENY = [
  [/\b(mike|claire|cynthia|jamie|jasmine|jy)\b/i, "a member of this squad"],
  [/tdmpukylkqgibfddedxi/, "this squad's Supabase project ref"],
  [/cjo-squad-mission-pi/, "this squad's production URL"],
  [/q4-2026|Q4 2026/, "this squad's campaign"],
  [/sb_secret_[A-Za-z0-9]/, "a Supabase secret key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY/, "a private key"],
  [/eyJhbGciOi[A-Za-z0-9_-]{20,}/, "a JWT"],
];
// The test fixture campaign keeps its slug: it is created inside the tests and rolled back.
const DENY_ALLOW = { "this squad's campaign": [/^supabase\/tests\/database\//] };

const files = git("ls-tree", "-r", "--name-only", "HEAD")
  .split("\n")
  .filter(Boolean)
  .filter((p) => !EXCLUDE.has(p) && !EXCLUDE_PREFIX.some((x) => p.startsWith(x)));

const write = (path, data) => {
  mkdirSync(dirname(join(out, path)), { recursive: true });
  writeFileSync(join(out, path), data);
};

// Placeholder app name, for the service worker's fallback title.
const starterConfig = git("show", "HEAD:starter/src/config/squad.ts");
const appName = /appName: ("[^"]+")/.exec(starterConfig)?.[1];
const currentName = /appName: ("[^"]+")/.exec(git("show", "HEAD:src/config/squad.ts"))?.[1];
if (!appName || !currentName) throw new Error("could not read appName from the squad configs");

for (const path of files) {
  const source = overrides.includes(path) ? `starter/${path}` : path;
  let data = execFileSync("git", ["show", `HEAD:${source}`], { maxBuffer: 64 * 1024 * 1024 });
  if (path === "public/sw.js") {
    const sw = data.toString("utf8");
    const from = `data.title || ${currentName}`;
    if (!sw.includes(from)) throw new Error("public/sw.js: fallback title not found");
    data = Buffer.from(sw.replace(from, `data.title || ${appName}`));
  }
  write(path, data);
}
for (const path of overrides) if (!files.includes(path)) write(path, git("show", `HEAD:starter/${path}`));

// Scan every text file that was written.
const problems = [];
const all = [...new Set([...files, ...overrides])];
for (const path of all) {
  const buf = readFileSync(join(out, path));
  if (buf.includes(0)) continue; // binary (icons)
  const lines = buf.toString("utf8").split("\n");
  for (const [re, what] of DENY) {
    if (DENY_ALLOW[what]?.some((ok) => ok.test(path))) continue;
    lines.forEach((line, i) => {
      if (re.test(line)) problems.push(`${path}:${i + 1}: ${what}: ${line.trim().slice(0, 100)}`);
    });
  }
}
if (problems.length) {
  console.error(`export-starter: ${problems.length} squad-specific or secret-looking line(s) found:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`Exported ${all.length} files to ${out} (from ${git("rev-parse", "--short", "HEAD").trim()}). Scan clean.`);
