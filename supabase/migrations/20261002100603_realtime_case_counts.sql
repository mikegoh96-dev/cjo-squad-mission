-- =============================================================================
-- Real-time sync: broadcast changes to case counts (and squad membership) over
-- Supabase Realtime so every open dashboard updates within a second.
--
-- Realtime "postgres_changes" respects RLS: browsers receive only rows the anon
-- role may SELECT (these tables are already public-read). No new permissions.
-- Idempotent, and a no-op where the supabase_realtime publication is missing.
-- =============================================================================
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication not found; skipping';
    return;
  end if;
  foreach t in array array['member_case_counts', 'squad_members'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
