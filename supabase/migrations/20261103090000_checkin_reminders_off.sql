-- Check-in reminders off (owner's decision, 2026-11-02): the check-in card and
-- the cheer panel were removed from the Squad page, so nobody can confirm a
-- count any more and reminders could never be stopped. The planner already
-- plans none when reminder_cap = 0; queued reminders are cancelled. The
-- reminder machinery stays in the database (set reminder_cap back to 1-3 to
-- use it again with a check-in screen).
update private.notify_policy set reminder_cap = 0 where id;

update private.notification_jobs
   set status = 'cancelled', reason = 'reminders_off', finished_at = now(),
       claim_token = null, lease_until = null
 where kind = 'reminder' and status = 'pending';
