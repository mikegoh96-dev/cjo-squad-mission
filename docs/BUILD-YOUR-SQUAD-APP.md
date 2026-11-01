# Build your own Squad Mission app

This guide is for **squad leaders in Charles Juay Organisation** who want their own copy of the Squad Mission app. You keep all of it:

- the live -/+ squad board and the Mission page;
- milestones, momentum, the splash screen and the animations;
- Squad Recap, with downloadable weekly and monthly Instagram Story videos;
- push notifications (optional).

You supply your own squad members, campaign targets and accounts.

You don't need to know how to code. You start from the ready-made **starter template**, paste one **master prompt** into Claude Code, and it sets things up with you step by step.

Starter template: **https://github.com/mikegoh96-dev/cjo-squad-starter**

---

## 1. What you get, and what stays yours

| Same for every squad | Yours alone |
|---|---|
| All features, design, animations, maths and security rules | Your own **GitHub** repository (the code) |
| The "collective only" rules: no rankings, and nobody is singled out for not adding cases | Your own **Supabase** project (the database) |
| Future improvements, if you choose to pull them in (section 7) | Your own **Vercel** project (the website link) |
| | Your squad name, members, campaign dates and monthly targets |

Your app and data are **completely separate** from every other squad. There is no shared database and no cross-squad dashboard. Nobody else can see your squad's numbers, and you can't see theirs.

How the app works: one shared link, no login. Everyone in your squad opens the same link and taps -/+ on their own card. The app stores **case counts only**, never client names or details.

---

## 2. Before you start (about an hour the first time)

Create these free accounts, using the same email for all of them if you can:

1. **GitHub**: https://github.com/signup
2. **Supabase**: https://supabase.com, sign in with GitHub. The free plan is enough.
3. **Vercel**: https://vercel.com, sign in with GitHub. The free Hobby plan is enough.
4. **Claude Code**: use it at https://claude.ai/code (easiest) or in the Claude desktop app.

Then:

- **Make your copy.** Open https://github.com/mikegoh96-dev/cjo-squad-starter and click **Use this template**, then **Create a new repository**. Choose yourself as the owner, a name such as `team-alpha-mission`, and **Private**.
- **Have your squad details ready.** The master prompt asks for them:

| Detail | Example | Goes into |
|---|---|---|
| Squad name (shown on the board) | Team Alpha | `squad.setup.json` |
| Members' first names, as they should appear | Aisha, Ben, Chloe, Daniel | `squad.setup.json` |
| Avatar for each member: `man`, `woman`, or blank for initials | Aisha = woman, Ben = man … | `src/config/squad.ts` |
| App name (top of the screen, splash, videos) | CJO Team Alpha Mission | `src/config/squad.ts` |
| Short name (under the Home Screen icon, about 12 characters max) | Team Alpha | `src/config/squad.ts` |
| Campaign name and short code | Team Alpha Q1 2027, `q1-2027` | `squad.setup.json` |
| Campaign start and end dates | 2027-01-01 to 2027-03-31 | `squad.setup.json` |
| Monthly squad targets (cases) | Jan 15, Feb 20, Mar 25 | `squad.setup.json` |
| Time zone | Asia/Singapore (keep this unless your squad is elsewhere) | `squad.setup.json` |

Your squad lives in just those **two files**. Everything else stays the same as the template, which keeps future updates easy.

---

## 3. The master prompt

Open Claude Code, start a session on **your new repository**, and paste everything inside the box below. Replace the `<…>` parts first, or leave them and Claude will ask you.

````text
You are helping me, a CJO squad leader, set up my own independent copy of the
Squad Mission app (made from the cjo-squad-starter template) for my squad.
Work with me step by step, explain each step in plain language, and wait for
me whenever I need to do something in a website (GitHub, Supabase, Vercel).

MY REPOSITORY: <https://github.com/MY-ACCOUNT/MY-REPO> (work on main)

MY SQUAD
- Squad name: <Team Alpha>
- App name: <CJO Team Alpha Mission>
- Short name: <Team Alpha>
- Members (first name = avatar): <Aisha = woman, Ben = man, Chloe = woman, Daniel = man>
- Campaign name: <Team Alpha Q1 2027>, slug: <q1-2027>
- Campaign dates: <2027-01-01> to <2027-03-31>
- Monthly targets: <2027-01: 15, 2027-02: 20, 2027-03: 25>
- Time zone: <Asia/Singapore>

FIRST, read CLAUDE.md, AGENTS.md and README.md. CLAUDE.md is the rulebook
(see "New squads: config, setup, starter template"). This Next.js version
differs from older ones; check node_modules/next/dist/docs before changing
Next.js code.

THEN PERSONALISE (only these two files, plus one line in public/sw.js):
1. src/config/squad.ts: appName, shortName, recapTitle (e.g. "<short name>
   Recap"), fileSlug (e.g. "Team-Alpha-Recap": letters, digits, dashes),
   and avatars (lowercase first names; "man" or "woman"; members I leave
   blank get initials). Keep tagline/description unless I ask. Change the
   notifications wording only if my time zone is not Singapore.
2. public/sw.js: set the fallback title to the same appName (a unit test
   checks they match).
3. Copy squad.setup.example.json to squad.setup.json and fill in my squad,
   members and campaign (targets as "YYYY-MM": cases). Leave appUrl for now.
   squad.setup.json is git-ignored: never commit it.
4. Run `npm ci` and `npm run check`, and fix anything that fails.

RULES YOU MUST FOLLOW
- Keep every feature, calculation, animation, business rule, RLS policy and
  grant exactly as it is. Do not weaken database permissions, do not add a
  login, do not add an admin screen, do not edit existing migrations.
- Keep the collective rules: no rankings or leaderboards, and never show how
  many or which teammates did or didn't add cases. Counts only, never client
  data.
- Never put a secret key in a NEXT_PUBLIC_ variable, in Vercel, in chat
  output, or in a commit. .env.local, squad.setup.json and
  supabase/setup.local.sql must never be committed (they are git-ignored).
- Run `npm run check` before every push and report real results only.

THEN GUIDE ME THROUGH SETUP, ONE STEP AT A TIME
a. Supabase: I create a new project (region: Southeast Asia (Singapore); save
   the database password). Show me where to find the Project URL and the
   publishable key (Project Settings > API Keys).
b. Create .env.local with NEXT_PUBLIC_SUPABASE_URL and
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
c. Apply the database: npx supabase login, npx supabase link --project-ref
   <ref>, npx supabase db push.
d. Run `npm run setup`, then have me paste supabase/setup.local.sql into
   Supabase > SQL Editor and run it once. Check the result row with me
   (squad, member count, campaign, targets).
e. npm run dev and show me the board works locally with my members.
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

1. **Generate keys:**
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

3. **Generate the scheduler SQL:**
   - Put the same `PUSH_SECRET` and `CRON_SECRET` in your `.env.local`.
   - Set `appUrl` in `squad.setup.json` to your Vercel **production** link (Project > Domains).
   - Run:
     ```bash
     npm run setup -- --push
     ```
   - Paste `supabase/setup.local.sql` into Supabase > SQL Editor and run it.

   The SQL turns on the scheduler tools, stores a hash of `PUSH_SECRET`, keeps `CRON_SECRET` in Supabase Vault, and schedules a job that asks your app every minute to send what's due. The result row should show `push_ready` and `scheduler_ready` as `true`.

   **Then delete `supabase/setup.local.sql`**, because it contains your secrets.
4. **Check that it's working** after two minutes, in the SQL Editor:
   ```sql
   select status_code, created from net._http_response order by created desc limit 5;
   ```
   You want `200`. `401` means `CRON_SECRET` in Vercel doesn't match `.env.local`, or you didn't redeploy after adding it. `404` means `appUrl` is wrong.
5. **On each phone:**
   - **iPhone:** open the link in Safari, tap Share, then **Add to Home Screen**. Open the app from the Home Screen icon and tap **Turn on notifications**. iPhones only allow push from Home Screen apps.
   - **Android:** open the link in Chrome and tap **Turn on notifications**.

To change a secret later: update it in Vercel and `.env.local`, redeploy, then run `npm run setup -- --push` and paste the file again.

---

## 5. Security rules: where each key goes

| Key | Where it goes | Never |
|---|---|---|
| Project URL, publishable key (`sb_publishable_…`) | `.env.local` and Vercel | Safe to be public; the database's own rules protect the data |
| `VAPID_PRIVATE_KEY`, `PUSH_SECRET`, `CRON_SECRET` | Vercel and `.env.local` | Not in a `NEXT_PUBLIC_` variable, not in GitHub |
| Secret key (`sb_secret_…`), only for `npm run members` | `.env.local` on **your** computer, only if you need it | Not in Vercel, not in chat, not in GitHub |

More rules:
- `.env.local`, `squad.setup.json` and `supabase/setup.local.sql` are ignored by Git. Never force-add them.
- If a secret leaks, rotate it: Supabase, under API Keys, creates a new key; section 4 covers the push secrets.
- The squad link is the "password". Share it only inside your squad. If it leaks, anyone with it could tap -/+. Every change is kept in the database history, so wrong counts can be spotted and corrected (ask Claude Code to help).

---

## 6. Checklist and troubleshooting

**First-day checklist**
- [ ] The board shows every member with the right avatar.
- [ ] The Mission page shows this month's target.
- [ ] A -/+ tap on one phone appears on another within a few seconds. The header says "Live".
- [ ] Squad Recap opens, and **Generate Video**, then **Download Video**, saves an MP4. On browsers that can't make video it offers a PNG image instead.
- [ ] (Push) Notifications are turned on and a tap from another phone gives an alert.

**Troubleshooting and changes**

| You see or want | What to do |
|---|---|
| "Mission control is getting ready … being set up" | Today is outside the campaign dates, or `npm run setup` hasn't been run yet. Check the dates in `squad.setup.json`, then run setup and paste the SQL |
| An error screen with "Try again" on the Vercel link (but it works locally) | The `NEXT_PUBLIC_…` variables are missing in Vercel. Add them and **redeploy** |
| "Auto-updating" instead of "Live" | Realtime is blocked on that network. The app still refreshes on its own |
| The app stopped working after a quiet break | Free Supabase projects **pause after about 7 days with no activity**. Open the Supabase dashboard and click **Restore project** |
| No notifications on iPhone | It must be opened from the **Home Screen** icon, iOS 16.4 or later |
| Notifications stopped | Run the `net._http_response` check (section 4, step 4) |
| A new member joins | Add them to `squad.setup.json` (and their avatar to `src/config/squad.ts`), run `npm run setup`, and paste the SQL. Existing members are left as they are |
| A member leaves | `npm run members -- list`, then `npm run members -- remove <id>` (needs the secret key in `.env.local`). This also deletes their counts |
| A monthly target changes | Edit it in `squad.setup.json`, run `npm run setup`, and paste the SQL |
| Next quarter's campaign | Give the campaign a new `slug`, name, dates and targets in `squad.setup.json`, then run setup and paste the SQL. Campaigns must not overlap |

---

## 7. Getting future improvements

When the starter template gets a new feature, you can pull it into your app. Paste this into Claude Code:

```text
Pull the latest changes from the starter template
(https://github.com/mikegoh96-dev/cjo-squad-starter, main) into my main.
Add it as a remote called "upstream" if it isn't one yet. My repository was
created from the template, so the very first time use
`git merge upstream/main --allow-unrelated-histories`; after that a normal
merge. Never rebase or force-push. When files conflict, keep MY version of
src/config/squad.ts, public/sw.js's fallback title and anything else I
personalised, and take the template's version of everything else. Then run
npm ci and npm run check, tell me if there are new supabase/migrations files
to apply with npx supabase db push, and whether any step in
docs/BUILD-YOUR-SQUAD-APP.md changed.
```

Pushing to your `main` redeploys your app on Vercel automatically.

---

*Questions? Ask the squad leader who shared this with you, or ask Claude Code. It can read `CLAUDE.md`, which explains how every part of the app works.*
