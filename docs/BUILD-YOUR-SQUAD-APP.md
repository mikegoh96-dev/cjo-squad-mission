# Build your own Squad Mission app

This guide is for **squad leaders in Charles Juay Organisation** who want their own copy of the Squad Mission app. You keep all of it:

- the live -/+ squad board and the Mission page;
- milestones, momentum, the splash screen and the animations;
- Squad Recap, with downloadable weekly and monthly Instagram Story videos;
- push notifications (optional).

You supply your own squad members, campaign targets and accounts.

You don't need to know how to code. You paste one **master prompt** into Claude Code, and it does the edits with you step by step.

---

## 1. What you get, and what stays yours

| Shared with Mike's app | Yours alone |
|---|---|
| All features, design, animations, maths and security rules | Your own **GitHub** repository (the code) |
| The "collective only" rules: no rankings, and nobody is singled out for not adding cases | Your own **Supabase** project (the database) |
| Future improvements, if you choose to pull them in (section 7) | Your own **Vercel** project (the website link) |
| | Your squad name, members, campaign dates and monthly targets |

Your app and data are **completely separate** from every other squad. There is no shared database and no cross-squad dashboard. Nobody else can see your squad's numbers, and you can't see theirs.

How the app works: one shared link, no login. Everyone in your squad opens the same link and taps -/+ on their own card. The app stores **case counts only**, never client names or details.

---

## 2. Before you start (about 60–90 minutes the first time)

Create these free accounts, using the same email for all of them if you can:

1. **GitHub**: https://github.com/signup
2. **Supabase**: https://supabase.com, sign in with GitHub. The free plan is enough.
3. **Vercel**: https://vercel.com, sign in with GitHub. The free Hobby plan is enough.
4. **Claude Code**: use it at https://claude.ai/code (easiest) or in the Claude desktop app.

Then:

- **Ask Mike for read access** to his repository (`mikegoh96-dev/cjo-squad-mission`) so you can copy the code.
- **On GitHub, create an empty private repository** for your squad, for example `team-alpha-mission`. Don't add a README; leave it empty. Claude Code can't create repositories for you, but it can push to one you made.
- **Have your squad details ready.** The master prompt asks for them, so you can fill them in now:

| Detail | Example |
|---|---|
| Squad name (shown on the board) | Team Alpha |
| App name (top of the screen, splash, videos) | CJO Team Alpha Mission |
| Short name (under the Home Screen icon, about 12 characters max) | Team Alpha |
| Members' first names, as they should appear | Aisha, Ben, Chloe, Daniel |
| Avatar for each member: `man`, `woman`, or leave blank for initials | Aisha = woman, Ben = man … |
| Campaign name | Team Alpha Q1 2027 |
| Campaign start and end dates | 2027-01-01 to 2027-03-31 |
| Monthly squad targets (cases) | Jan 15, Feb 20, Mar 25 |
| Time zone | Asia/Singapore (keep this unless your squad is elsewhere) |

---

## 3. The master prompt

Open Claude Code, start a session in your **new empty repository**, and paste everything inside the box below. Replace the `<…>` parts first, or leave them and Claude will ask you.

````text
You are helping me, a CJO squad leader, set up my own independent copy of the
"CJO Squad Mission" app for my squad. Work with me step by step, explain each
step in plain language, and wait for me whenever I need to do something in a
website (GitHub, Supabase, Vercel).

SOURCE CODE
- Original app: https://github.com/mikegoh96-dev/cjo-squad-mission (branch main).
  I have read access.
- My new, empty repository: <https://github.com/MY-ACCOUNT/MY-REPO>
- Copy the full history of the original into my repository (clone it, point
  origin at my repository, keep the original as a remote called "upstream",
  push main). Work on main.

MY SQUAD
- Squad name: <Team Alpha>
- App name: <CJO Team Alpha Mission>
- Short name: <Team Alpha>
- Members (first name = avatar): <Aisha = woman, Ben = man, Chloe = woman, Daniel = man>
- Campaign name: <Team Alpha Q1 2027>, slug: <q1-2027>
- Campaign dates: <2027-01-01> to <2027-03-31>
- Monthly targets: <2027-01: 15, 2027-02: 20, 2027-03: 25>
- Time zone: <Asia/Singapore>

FIRST, read CLAUDE.md and AGENTS.md in the repository. They are the rulebook.
This Next.js version differs from older ones; check node_modules/next/dist/docs
before changing Next.js code.

THEN MAKE ONLY THESE CHANGES (personalise, don't redesign):
1. Branding: replace "CJO Squad Mission", "CJO Squad", "CJO SQUAD MISSION" and
   "CJO Squad Recap" with my app name / short name in:
   src/config/site.ts (name, tagline, description), src/app/layout.tsx
   (appleWebApp.title), src/app/manifest.ts (short_name),
   src/components/splash-screen.tsx, public/sw.js (fallback title),
   src/components/push/notifications-card.tsx ("Open … from your Home Screen"),
   src/components/recap/video/composition.tsx (both titles drawn in the video;
   keep the uppercase one uppercase and check long names still fit the 1080px
   canvas), src/lib/recap-video.ts (download file names "CJO-Squad-Recap-…"),
   src/lib/recap.ts, src/components/recap/recap-player.tsx and
   src/components/recap/recap-video.tsx (share titles / summary text).
   Search the whole src/ and public/ folders for "CJO" afterwards and show me
   anything left. Leave internal keys such as "cjo:me", "cjo.changed_by" and
   "cjo:notify:plan" unchanged: they are invisible and renaming them adds risk.
   Keep the existing icons (they are CJO branding).
2. Avatars: replace the names in src/lib/avatars.ts with my members (lowercase
   first names; "man" or "woman"; members I left blank get initials). Update
   src/lib/avatars.test.ts to match.
3. Campaign: replace the contents of
   supabase/migrations/20261002035215_campaign_q4_2026.sql with my campaign
   (same structure: one campaigns row + one monthly_targets row per month,
   months as the first day of the month) and rename the file to
   20261002035215_campaign_<my slug>.sql (keep the timestamp). Update the
   matching assertions in supabase/tests/database/01_schema.test.sql (they
   look up slug 'q4-2026' and expect 20/30/40).
4. Squad settings: add ONE new migration (npx supabase migration new
   squad_settings) that sets my campaign's time zone
   (update public.campaigns set time_zone = '<tz>' where slug = '<slug>') and
   update private.notify_policy set time_zone = '<tz>', reminders_from =
   '<campaign start date>'. If my time zone is not Singapore, also change the
   words "Singapore time" in src/components/push/notifications-card.tsx.
5. Project names: "name" in package.json, project_id in supabase/config.toml.
6. Docs: update README.md and the top of CLAUDE.md to describe my squad, and
   remove the notes about Mike's hosted Supabase project (project ref, dates
   applied) from CLAUDE.md "Database and migrations"; replace them with mine
   once we have set it up. Remove the member names from CLAUDE.md.

RULES YOU MUST FOLLOW
- Keep every feature, calculation, animation, business rule, RLS policy and
  grant exactly as it is. Do not weaken database permissions, do not add a
  login, do not add an admin screen.
- Keep the collective rules: no rankings or leaderboards, and never show how
  many or which teammates did or didn't add cases. Counts only, never client
  data.
- Never put a secret key in a NEXT_PUBLIC_ variable, in Vercel, in chat
  output, or in a commit. .env.local must never be committed.
- Never touch Mike's GitHub repository, Supabase project or Vercel project:
  only read from upstream.
- Run `npm ci` then `npm run check` (lint, typecheck, unit tests, build) and
  fix anything that fails before every push. Report real results only.

THEN GUIDE ME THROUGH SETUP, ONE STEP AT A TIME
a. Supabase: I create a new project (region: Southeast Asia (Singapore); save
   the database password). Tell me where to find the Project URL, the
   publishable key and the secret key (Project Settings > API Keys).
b. Create .env.local with NEXT_PUBLIC_SUPABASE_URL,
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and (for the admin script only)
   SUPABASE_SECRET_KEY.
c. Apply the database: npx supabase login, npx supabase link --project-ref
   <ref>, npx supabase db push. Then confirm the campaign and targets exist.
d. Add my members with: npm run members -- add "<squad name>" "<member>"
   (one per member), then npm run members -- list.
e. npm run dev and show me the board works locally.
f. Commit and push to my repository's main.
g. Vercel: I import my repository (Add New > Project), add the two
   NEXT_PUBLIC_ variables only, and deploy. Then we open the link on two
   phones and check a -/+ tap shows up live on the other phone, the Mission
   page shows my targets, and Squad Recap opens and downloads a video.
h. Ask me whether I want push notifications now. If yes, follow section 4 of
   docs/BUILD-YOUR-SQUAD-APP.md exactly.
````

**Tip:** if Claude Code stops partway, for example because a session times out, paste this to resume: "Continue the squad app setup from where we stopped. Check git status and what's already done first."

---

## 4. Optional add-on: push notifications

Skip this section at first if you like. The app works fully without it, and the notifications card stays hidden until it's configured.

Push gives your squad:
- grouped "Ben added 2 cases" alerts;
- milestone and almost-there alerts;
- gentle check-in reminders;
- a Monday recap.

There are no alerts during quiet hours (10pm–8am).

Ask Claude Code to walk you through these steps:

1. **Generate keys** on your computer or in Claude Code:
   ```bash
   npx web-push generate-vapid-keys        # gives a public and a private key
   openssl rand -hex 32                    # run twice: one PUSH_SECRET, one CRON_SECRET
   ```
2. **Add four variables in Vercel** (Project > Settings > Environment Variables), then **redeploy**:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key |
   | `VAPID_PRIVATE_KEY` | VAPID private key |
   | `PUSH_SECRET` | first random value |
   | `CRON_SECRET` | second random value |

3. **Turn on the scheduler.** In Supabase, open **SQL Editor**, paste the following, replace the three `<…>` values, and run it **once**:
   ```sql
   -- Tools the scheduler needs (free on all plans)
   create extension if not exists pg_cron;
   create extension if not exists pg_net;

   -- Lets your app's server use the push outbox (stores only a hash)
   insert into private.push_settings (secret_hash)
   values (sha256(convert_to('<PUSH_SECRET>', 'UTF8')));

   -- Keeps CRON_SECRET in Supabase Vault instead of in the job text
   select vault.create_secret('<CRON_SECRET>', 'cjo_cron_secret');

   -- Every minute, ask your app to send any due notifications
   select cron.schedule(
     'cjo-notify-every-minute',
     '* * * * *',
     $$
     select net.http_post(
       url := 'https://<your-app>.vercel.app/api/notify/run',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || (
           select decrypted_secret from vault.decrypted_secrets
           where name = 'cjo_cron_secret'
         )
       ),
       body := '{}'::jsonb,
       timeout_milliseconds := 55000
     );
     $$
   );
   ```
   Use your real Vercel **production** link, the one under Project > Domains.
4. **Check that it's working** after two minutes:
   ```sql
   select status_code, created from net._http_response order by created desc limit 5;
   ```
   You want `200`. `401` means `CRON_SECRET` in Vercel doesn't match the Vault value, or you didn't redeploy after adding it. `404` means the URL is wrong.
5. **On each phone:**
   - **iPhone:** open the link in Safari, tap Share, then **Add to Home Screen**. Open the app from the Home Screen icon and tap **Turn on notifications**. iPhones only allow push from Home Screen apps.
   - **Android:** open the link in Chrome and tap **Turn on notifications**. Adding it to the Home Screen is optional.

To change secrets later:
- **New `PUSH_SECRET`:** update the Vercel variable, then run `update private.push_settings set secret_hash = sha256(convert_to('<new>', 'UTF8'));`.
- **New `CRON_SECRET`:** update the Vercel variable, then run `select vault.update_secret((select id from vault.secrets where name = 'cjo_cron_secret'), '<new>');`.

---

## 5. Security rules: where each key goes

| Key | Where it goes | Never |
|---|---|---|
| Project URL, publishable key (`sb_publishable_…`) | `.env.local` and Vercel | Safe to be public; the database's own rules protect the data |
| Secret key (`sb_secret_…`) | `.env.local` on **your** computer only, for `npm run members` | Not in Vercel, not in chat, not in GitHub |
| `VAPID_PRIVATE_KEY`, `PUSH_SECRET`, `CRON_SECRET` | Vercel (and the one-time SQL above) | Not in a `NEXT_PUBLIC_` variable, not in GitHub |

More rules:
- `.env.local` is already ignored by Git. Never force-add it.
- If a secret leaks, rotate it: Supabase, under API Keys, creates a new secret key; section 4 covers the push secrets.
- The squad link is the "password". Share it only inside your squad. If it leaks, anyone with it could tap -/+. Every change is kept in the database history, so wrong counts can be spotted and corrected (ask Claude Code to help).

---

## 6. Checklist and troubleshooting

**First-day checklist**
- [ ] The board shows every member with the right avatar.
- [ ] The Mission page shows this month's target.
- [ ] A -/+ tap on one phone appears on another within a few seconds. The header says "Live".
- [ ] Squad Recap opens, and **Generate Video**, then **Download Video**, saves an MP4. On browsers that can't make video it offers a PNG image instead.
- [ ] (Push) Notifications are turned on and a test tap from another phone gives an alert.

**Troubleshooting**

| You see | Likely cause and fix |
|---|---|
| "Mission control is getting ready … Your squad is being added" | The campaign exists but no members have been added. Run `npm run members -- add "<squad>" "<name>"` |
| "Mission control is getting ready … being set up" | Today is outside the campaign dates, or the targets are missing. Check the campaign migration's dates, run `npx supabase db push`, and run `select * from public.campaigns;` |
| An error screen with "Try again" on the Vercel link (but it works locally) | The `NEXT_PUBLIC_…` variables are missing in Vercel. Add them and **redeploy** |
| "Auto-updating" instead of "Live" | Realtime is blocked on that network. The app still refreshes on its own |
| The app stopped working after a quiet break | Free Supabase projects **pause after about 7 days with no activity**. Open the Supabase dashboard and click **Restore project** |
| No notifications on iPhone | It must be opened from the **Home Screen** icon, iOS 16.4 or later |
| Notifications stopped | Run the `net._http_response` check (section 4, step 4) |
| A member left or joined | `npm run members -- list`, then `remove <id>` or `add` |
| A target needs changing | Ask Claude Code to add a migration that updates `public.monthly_targets`, then run `npx supabase db push`. Don't edit old migrations that are already applied |
| A new campaign (next quarter) | Ask Claude Code to add a migration with the new campaign and targets |

---

## 7. Getting future improvements

When Mike's app gets a new feature, you can pull it into yours. Paste this into Claude Code:

```text
Pull the latest changes from upstream (mikegoh96-dev/cjo-squad-mission, main)
into my main with a merge (no rebase, no force push). When files I personalised
conflict (branding, avatars, campaign, squad settings, README/CLAUDE.md), keep
MY values and take everything else from upstream. Never take upstream's
campaign migration or member names. Run npm run check, then tell me if there
are new supabase/migrations files I need to apply with npx supabase db push,
and whether any setup step in docs/BUILD-YOUR-SQUAD-APP.md changed.
```

Pushing to your `main` redeploys your app on Vercel automatically.

---

*Questions? Ask Mike, or ask Claude Code. It can read `CLAUDE.md`, which explains how every part of the app works.*
