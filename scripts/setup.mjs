#!/usr/bin/env node
// One-time database setup for a squad's own Supabase project.
//
//   npm run setup              squad, members, campaign + monthly targets, policy
//   npm run setup -- --push    the same, plus push notifications (secret hash,
//                              Vault secret, Supabase Cron job)
//
// Reads squad.setup.json (copy squad.setup.example.json) and, with --push,
// PUSH_SECRET + CRON_SECRET from .env.local. Writes supabase/setup.local.sql:
// paste it into Supabase > SQL Editor and run it once (after `npx supabase db
// push`). Safe to run again: nothing is duplicated, and a new campaign slug
// adds the next campaign. Both files are git-ignored; the SQL file can contain
// secrets, so delete it once it has run.
//
// It never connects to a database and never needs the secret key.
import { readFileSync, writeFileSync } from "node:fs";

const CONFIG = "squad.setup.json";
const OUT = "supabase/setup.local.sql";
const CRON_JOB = "cjo-notify-every-minute";
const VAULT_NAME = "cjo_cron_secret";

const fail = (message) => {
  console.error(`setup: ${message}`);
  process.exit(1);
};

// --- read + validate ---------------------------------------------------------
const withPush = process.argv.includes("--push");
let cfg;
try {
  cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
} catch (e) {
  fail(e.code === "ENOENT" ? `${CONFIG} not found. Copy squad.setup.example.json to ${CONFIG} and fill it in.` : `${CONFIG}: ${e.message}`);
}

const text = (value, label, max) => {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > max) {
    fail(`${label} must be text of 1 to ${max} characters`);
  }
  return value.trim();
};
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

const squad = text(cfg.squad, "squad", 80);
if (!Array.isArray(cfg.members) || cfg.members.length === 0) fail("members must list at least one name");
const members = cfg.members.map((m, i) => text(m, `members[${i}]`, 80));
const lower = members.map((m) => m.toLowerCase());
const dup = lower.find((m, i) => lower.indexOf(m) !== i);
if (dup) fail(`members: "${dup}" is listed twice`);

const c = cfg.campaign ?? fail("campaign is missing");
const slug = text(c.slug, "campaign.slug", 60);
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fail('campaign.slug: lowercase letters, digits and dashes only, e.g. "q1-2027"');
const name = text(c.name, "campaign.name", 120);
if (!isDate(c.startsOn) || !isDate(c.endsOn)) fail('campaign.startsOn / endsOn must be dates like "2027-01-01"');
if (c.endsOn < c.startsOn) fail("campaign.endsOn is before campaign.startsOn");
const timeZone = text(c.timeZone ?? "Asia/Singapore", "campaign.timeZone", 60);
try {
  new Intl.DateTimeFormat("en", { timeZone });
} catch {
  fail(`campaign.timeZone "${timeZone}" is not a valid time zone (e.g. "Asia/Singapore")`);
}
const targets = Object.entries(c.targets ?? {}).map(([month, cases]) => {
  if (!/^\d{4}-\d{2}$/.test(month)) fail(`campaign.targets: "${month}" must look like "2027-01"`);
  if (!Number.isInteger(cases) || cases < 1 || cases > 100000) fail(`campaign.targets["${month}"] must be a whole number above 0`);
  const first = `${month}-01`;
  if (first < c.startsOn.slice(0, 8) + "01" || first > c.endsOn) fail(`campaign.targets: ${month} is outside the campaign dates`);
  return { month: first, cases };
});
if (targets.length === 0) fail("campaign.targets needs at least one month");

let push = null;
if (withPush) {
  const pushSecret = process.env.PUSH_SECRET ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (pushSecret.length < 32 || cronSecret.length < 32) {
    fail("--push needs PUSH_SECRET and CRON_SECRET (32+ characters each) in .env.local (the same values as in Vercel)");
  }
  let url;
  try {
    url = new URL(text(cfg.appUrl, "appUrl", 200));
  } catch {
    fail('appUrl must be your Vercel production link, e.g. "https://team-alpha-mission.vercel.app"');
  }
  if (url.protocol !== "https:") fail("appUrl must start with https://");
  push = { pushSecret, cronSecret, endpoint: new URL("/api/notify/run", url.origin).href };
}

// --- SQL ---------------------------------------------------------------------
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const memberArray = `array[${members.map(q).join(", ")}]::text[]`;
const targetRows = targets.map((t) => `(date ${q(t.month)}, ${t.cases})`).join(", ");

const core = `-- 1. Squad, members, campaign, monthly targets and notification policy.
do $setup$
declare
  v_squad uuid;
  v_campaign uuid;
  v_member uuid;
  v_name text;
  v_added int := 0;
  v_other text;
begin
  -- One squad per deployment: the app shows the oldest squad.
  select name into v_other from public.squads where name <> ${q(squad)} order by created_at limit 1;
  if v_other is not null then
    raise exception 'This database already has the squad "%". Each squad needs its own Supabase project.', v_other;
  end if;

  insert into public.squads (name) values (${q(squad)}) on conflict (name) do nothing;
  select id into v_squad from public.squads where name = ${q(squad)};

  foreach v_name in array ${memberArray} loop
    if not exists (
      select 1 from public.squad_members sm join public.members m on m.id = sm.member_id
      where sm.squad_id = v_squad and lower(m.display_name) = lower(v_name)
    ) then
      insert into public.members (display_name) values (v_name) returning id into v_member;
      insert into public.squad_members (squad_id, member_id) values (v_squad, v_member);
      v_added := v_added + 1;
    end if;
  end loop;

  select slug into v_other from public.campaigns
  where slug <> ${q(slug)} and starts_on <= date ${q(c.endsOn)} and ends_on >= date ${q(c.startsOn)}
  limit 1;
  if v_other is not null then
    raise exception 'Campaign "%" already covers some of these dates. Campaigns must not overlap.', v_other;
  end if;

  insert into public.campaigns (slug, name, starts_on, ends_on, time_zone)
  values (${q(slug)}, ${q(name)}, date ${q(c.startsOn)}, date ${q(c.endsOn)}, ${q(timeZone)})
  on conflict (slug) do update
    set name = excluded.name, starts_on = excluded.starts_on,
        ends_on = excluded.ends_on, time_zone = excluded.time_zone
  returning id into v_campaign;

  insert into public.monthly_targets (campaign_id, month, target_cases)
  select v_campaign, t.month, t.cases from (values ${targetRows}) as t (month, cases)
  on conflict (campaign_id, month) do update set target_cases = excluded.target_cases;

  -- Quiet hours and the weekly recap follow the campaign's time zone; check-in
  -- reminders apply from the first campaign month.
  update private.notify_policy
  set time_zone = ${q(timeZone)}, reminders_from = date_trunc('month', date ${q(c.startsOn)})::date
  where id;

  raise notice 'Squad "%": % new member(s). Campaign "%" with % monthly target(s).',
    ${q(squad)}, v_added, ${q(slug)}, ${targets.length};
end
$setup$;
`;

const pushSql = push
  ? `
-- 2. Push notifications. Contains secrets: delete this file once it has run.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $push$
declare
  v_id uuid;
begin
  -- Lets the app's server use the notification outbox (only the hash is stored).
  insert into private.push_settings (secret_hash)
  values (sha256(convert_to(${q(push.pushSecret)}, 'UTF8')))
  on conflict (id) do update set secret_hash = excluded.secret_hash;

  -- CRON_SECRET lives in Vault, not in the job text.
  select id into v_id from vault.secrets where name = ${q(VAULT_NAME)};
  if v_id is null then
    perform vault.create_secret(${q(push.cronSecret)}, ${q(VAULT_NAME)});
  else
    perform vault.update_secret(v_id, ${q(push.cronSecret)});
  end if;

  -- Every minute, ask the app to send what is due (same name = updated in place).
  perform cron.schedule(${q(CRON_JOB)}, '* * * * *', format($job$
    select net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = %L)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    )
  $job$, ${q(push.endpoint)}, ${q(VAULT_NAME)}));
end
$push$;
`
  : "";

const check = `
-- What is set up now:
select
  (select string_agg(name, ', ') from public.squads) as squad,
  (select count(*) from public.squad_members) as members,
  (select string_agg(slug || ' (' || starts_on || ' to ' || ends_on || ', ' || time_zone || ')', '; ' order by starts_on)
     from public.campaigns) as campaigns,
  (select string_agg(to_char(month, 'Mon YYYY') || ': ' || target_cases, ', ' order by month)
     from public.monthly_targets t join public.campaigns c on c.id = t.campaign_id
     where c.slug = ${q(slug)}) as targets${
       push
         ? `,
  (select count(*) from private.push_settings) = 1 as push_ready,
  (select count(*) from cron.job where jobname = ${q(CRON_JOB)}) = 1 as scheduler_ready`
         : ""
     };
`;

const sql = `-- Generated by \`npm run setup${withPush ? " -- --push" : ""}\` on ${new Date().toISOString().slice(0, 10)} from ${CONFIG}.
-- Run once in Supabase > SQL Editor, after \`npx supabase db push\`.
-- Git-ignored. Never commit it.

${core}${pushSql}${check}`;

writeFileSync(OUT, sql, { mode: 0o600 });
console.log(`Wrote ${OUT}: squad "${squad}", ${members.length} member(s), campaign "${slug}" (${targets.length} month(s))${push ? ", push notifications" : ""}.`);
console.log("Next: open Supabase > SQL Editor, paste the file's contents and run it once.");
if (push) console.log("It contains secrets: delete it after it has run.");
