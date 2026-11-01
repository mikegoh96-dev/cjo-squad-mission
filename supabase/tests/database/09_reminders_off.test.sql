-- Check-in reminders are switched off (20261103090000_checkin_reminders_off).
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);
select is((select reminder_cap from private.notify_policy where id), 0, 'check-in reminders are off: the planner queues none');
select * from finish();
rollback;
