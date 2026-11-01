-- =============================================================================
-- PC$ challenge: each member's cumulative production (PC$) for one challenge
-- (e.g. November), entered on their squad card. Completely separate from case
-- counts. PC$ is the member's own production total only: never client data.
--
-- * public.pc_challenges      the challenge as data: eligible production
--                             period, squad target, individual minimum and the
--                             entry window. Public read.
-- * public.member_pc_amounts  one CURRENT cumulative amount (whole dollars) per
--                             member per challenge. Public read (shared link,
--                             like case counts). No direct writes.
-- * private.pc_amount_history append-only audit of every change (trigger).
-- * public.submit_pc_amounts  the only write path: saves several members at
--                             once, conflict-safe per member (expected = the
--                             amount the screen last confirmed, null if none).
--                             A new amount REPLACES the previous one.
-- =============================================================================

create table public.pc_challenges (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- Production that counts, inclusive dates (shown to the squad).
  eligible_from date not null,
  eligible_to date not null,
  -- Squad target and individual minimum, whole dollars. The target is used as
  -- stored (any growth factor is already included).
  target_amount bigint not null check (target_amount > 0),
  member_minimum bigint not null check (member_minimum >= 0),
  -- Entries can be saved from opens_at until closes_at (exclusive).
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint pc_challenges_period_valid check (eligible_to >= eligible_from),
  constraint pc_challenges_window_valid check (closes_at > opens_at)
);
create index pc_challenges_campaign_id_idx on public.pc_challenges (campaign_id);

create table public.member_pc_amounts (
  challenge_id uuid not null references public.pc_challenges (id) on delete cascade,
  squad_member_id uuid not null references public.squad_members (id) on delete cascade,
  amount bigint not null check (amount between 0 and 100000000),
  updated_at timestamptz not null default now(),
  constraint member_pc_amounts_pkey primary key (challenge_id, squad_member_id)
);
create index member_pc_amounts_squad_member_id_idx on public.member_pc_amounts (squad_member_id);

create trigger member_pc_amounts_set_updated_at
  before update on public.member_pc_amounts
  for each row execute function private.set_updated_at();

create table private.pc_amount_history (
  id bigint generated always as identity primary key,
  challenge_id uuid not null references public.pc_challenges (id) on delete cascade,
  squad_member_id uuid not null references public.squad_members (id) on delete cascade,
  old_amount bigint,
  new_amount bigint not null,
  changed_at timestamptz not null default now()
);
create index pc_amount_history_member_idx on private.pc_amount_history (challenge_id, squad_member_id, changed_at);

create function private.record_pc_amount_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.amount = old.amount then
    return new;
  end if;
  insert into private.pc_amount_history (challenge_id, squad_member_id, old_amount, new_amount)
  values (new.challenge_id, new.squad_member_id, case when tg_op = 'UPDATE' then old.amount end, new.amount);
  return new;
end;
$$;

create trigger member_pc_amounts_history
  after insert or update on public.member_pc_amounts
  for each row execute function private.record_pc_amount_change();

-- -----------------------------------------------------------------------------
-- Access: read-only for the shared link; history private; writes via function
-- -----------------------------------------------------------------------------
alter table public.pc_challenges enable row level security;
alter table public.member_pc_amounts enable row level security;
alter table private.pc_amount_history enable row level security;

revoke all on table public.pc_challenges, public.member_pc_amounts from public, anon, authenticated;
revoke all on table private.pc_amount_history from public, anon, authenticated;
grant select on table public.pc_challenges, public.member_pc_amounts to anon, authenticated;
grant select, insert, update, delete on table public.pc_challenges, public.member_pc_amounts to service_role;
revoke all on function private.record_pc_amount_change() from public, anon, authenticated;

create policy "Public read" on public.pc_challenges for select to anon, authenticated using (true);
create policy "Public read" on public.member_pc_amounts for select to anon, authenticated using (true);

-- -----------------------------------------------------------------------------
-- The only write path
-- p_entries: [{"squad_member_id": uuid, "amount": int, "expected": int|null}]
-- Returns one row per entry: saved (stored), unchanged (already that amount),
-- conflict (changed elsewhere since the screen loaded; nothing written, the
-- current amount is returned). Invalid input or a closed window rejects the
-- whole batch.
-- -----------------------------------------------------------------------------
create function public.submit_pc_amounts(p_challenge_id uuid, p_entries jsonb)
returns table (squad_member_id uuid, status text, amount bigint)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c public.pc_challenges;
  e record;
  v_count integer;
  v_current bigint;
begin
  select * into c from public.pc_challenges pc where pc.id = p_challenge_id;
  if not found then
    raise exception 'unknown PC$ challenge' using errcode = '42704';
  end if;
  if now() < c.opens_at or now() >= c.closes_at then
    raise exception 'PC$ entries are closed' using errcode = 'P0002';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'entries must be a JSON array' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_entries);
  if v_count < 1 or v_count > 100 then
    raise exception 'between 1 and 100 entries per save' using errcode = '22023';
  end if;
  if (select count(distinct x ->> 'squad_member_id') from jsonb_array_elements(p_entries) x) <> v_count then
    raise exception 'each member at most once per save' using errcode = '22023';
  end if;

  for e in
    select (x ->> 'squad_member_id')::uuid as member,
           (x ->> 'amount')::bigint as new_amount,
           (x ->> 'expected')::bigint as expected
    from jsonb_array_elements(p_entries) x
    order by 1 -- lock members in a fixed order: two batch saves never deadlock
  loop
    if e.member is null or e.new_amount is null then
      raise exception 'member and amount are required' using errcode = '22004';
    end if;
    if e.new_amount < 0 or e.new_amount > 100000000 then
      raise exception 'amount must be between 0 and 100000000' using errcode = '23514';
    end if;
    if e.expected is not null and e.expected < 0 then
      raise exception 'expected amount must not be negative' using errcode = '22023';
    end if;

    -- Serialise saves for this member (two phones, double taps).
    perform 1 from public.squad_members sm where sm.id = e.member for update;
    if not found then
      raise exception 'unknown squad member' using errcode = '42704';
    end if;

    select a.amount into v_current
    from public.member_pc_amounts a
    where a.challenge_id = c.id and a.squad_member_id = e.member;

    if v_current is not distinct from e.new_amount then
      return query select e.member, 'unchanged'::text, e.new_amount;
    elsif v_current is distinct from e.expected then
      return query select e.member, 'conflict'::text, v_current;
    else
      insert into public.member_pc_amounts as a (challenge_id, squad_member_id, amount)
      values (c.id, e.member, e.new_amount)
      on conflict on constraint member_pc_amounts_pkey do update set amount = excluded.amount;
      return query select e.member, 'saved'::text, e.new_amount;
    end if;
  end loop;
end;
$$;

revoke all on function public.submit_pc_amounts(uuid, jsonb) from public;
grant execute on function public.submit_pc_amounts(uuid, jsonb) to anon, authenticated, service_role;
