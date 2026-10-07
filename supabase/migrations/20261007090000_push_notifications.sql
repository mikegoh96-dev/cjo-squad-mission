-- =============================================================================
-- Push notifications: when someone adds cases, every opted-in phone is told.
--
-- A "push device" is a browser push subscription (endpoint + encryption keys).
-- It is anonymous (shared link, no login): no member, name or personal data.
--
-- Access:
--   * browsers (anon) can only register or remove a device, through functions;
--     they can never list devices;
--   * the app server lists devices to send to through push_devices(secret).
--     The secret lives only in Vercel (PUSH_SECRET); the database stores its
--     SHA-256 hash in private.push_settings. No service-role key is needed.
--   * endpoints must belong to a known browser push service, so the server can
--     never be made to send requests to arbitrary URLs.
-- =============================================================================

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'Anonymous browser push subscriptions (opted-in devices). Private: written and read only through functions.';

-- Private: RLS on with no policies, no grants to browser roles.
alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;

-- One row: SHA-256 of the server's PUSH_SECRET.
create table private.push_settings (
  id boolean primary key default true check (id),
  secret_hash bytea not null check (octet_length(secret_hash) = 32)
);
alter table private.push_settings enable row level security;
revoke all on table private.push_settings from public, anon, authenticated;

-- Known browser push services (Chrome/Android/Samsung: FCM; Safari/iOS: Apple;
-- Firefox: Mozilla; Edge: Windows).
create function private.is_push_endpoint(p_endpoint text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_endpoint is not null
    and char_length(p_endpoint) <= 1000
    and p_endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/';
$$;

revoke all on function private.is_push_endpoint(text) from public;

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_known check (private.is_push_endpoint(endpoint));

create function private.push_secret_ok(p_secret text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select s.secret_hash = sha256(convert_to(p_secret, 'UTF8')) from private.push_settings s where s.id),
    false
  ) and char_length(coalesce(p_secret, '')) >= 32;
$$;
revoke all on function private.push_secret_ok(text) from public;

-- -----------------------------------------------------------------------------
-- Browser functions
-- -----------------------------------------------------------------------------
-- Add (or refresh) this device. Capped so the table cannot be flooded.
create function public.register_push_device(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.is_push_endpoint(p_endpoint) then
    raise exception 'unsupported push endpoint' using errcode = '22023';
  end if;
  if not exists (select 1 from public.push_subscriptions where endpoint = p_endpoint)
     and (select count(*) from public.push_subscriptions) >= 300 then
    raise exception 'too many devices' using errcode = '54000';
  end if;
  insert into public.push_subscriptions (endpoint, p256dh, auth)
  values (p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, last_seen_at = now();
end;
$$;

-- Remove this device (turning notifications off). Knowing the endpoint is
-- required, and only the browser that owns it has it.
create function public.unregister_push_device(p_endpoint text)
returns void
language sql volatile security definer set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

-- -----------------------------------------------------------------------------
-- Server functions (need PUSH_SECRET)
-- -----------------------------------------------------------------------------
create function public.push_devices(p_secret text)
returns table (endpoint text, p256dh text, auth text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.push_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query select s.endpoint, s.p256dh, s.auth from public.push_subscriptions s order by s.created_at;
end;
$$;

-- Drop devices the push service reported as gone (HTTP 404/410).
create function public.forget_push_devices(p_secret text, p_endpoints text[])
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if not private.push_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = any(p_endpoints);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.register_push_device(text, text, text) from public;
revoke all on function public.unregister_push_device(text) from public;
revoke all on function public.push_devices(text) from public;
revoke all on function public.forget_push_devices(text, text[]) from public;
grant execute on function public.register_push_device(text, text, text) to anon, authenticated, service_role;
grant execute on function public.unregister_push_device(text) to anon, authenticated, service_role;
grant execute on function public.push_devices(text) to anon, authenticated, service_role;
grant execute on function public.forget_push_devices(text, text[]) to anon, authenticated, service_role;
