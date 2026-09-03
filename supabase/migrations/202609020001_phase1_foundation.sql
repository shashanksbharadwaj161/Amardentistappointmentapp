begin;

create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum (
  'patient',
  'dentist',
  'front_desk',
  'clinic_manager',
  'clinic_owner',
  'admin',
  'super_admin'
);

create type public.app_mode as enum ('patient', 'professional');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  avatar_path text,
  locale text not null default 'en' check (locale in ('en', 'bn')),
  active_mode public.app_mode not null default 'patient',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_lower_idx on public.profiles (lower(email));

create table public.user_roles (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  unique (user_id, role)
);

create index user_roles_role_idx on public.user_roles (role);

create table public.admin_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  token_hash text not null unique,
  status public.invitation_status not null default 'pending',
  invited_by uuid not null references auth.users(id) on delete restrict,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  delivery_confirmed_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create unique index one_pending_admin_invite_per_email
  on public.admin_invitations (lower(email))
  where status = 'pending';

create table public.app_configuration (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  description text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (key ~ '^[a-z][a-z0-9_.-]{1,79}$')
);

insert into public.app_configuration (key, value, is_public, description) values
  ('app.supported_locales', '["en", "bn"]', true, 'Locales supported by patient-facing apps'),
  ('app.default_locale', '"en"', true, 'Default locale'),
  ('app.default_currency', '"BDT"', true, 'Default currency'),
  ('app.default_timezone', '"Asia/Dhaka"', true, 'Default application timezone');

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

create index audit_logs_actor_time_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id, created_at desc);

create or replace function public.has_role(required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid() and role = required_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin') or public.has_role('super_admin');
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger configuration_touch_updated_at
before update on public.app_configuration
for each row execute function public.touch_updated_at();

create or replace function public.write_audit(
  audit_action text,
  audit_target_type text,
  audit_target_id text default null,
  audit_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), audit_action, audit_target_type, audit_target_id, coalesce(audit_metadata, '{}'::jsonb));
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );

  insert into public.user_roles (user_id, role)
  values (new.id, 'patient')
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.accept_verified_admin_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_id uuid;
begin
  if new.email_confirmed_at is null then
    return new;
  end if;

  select id into invitation_id
  from public.admin_invitations
  where lower(email) = lower(coalesce(new.email, ''))
    and status = 'pending'
    and delivery_confirmed_at is not null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update skip locked;

  if invitation_id is not null then
    insert into public.user_roles (user_id, role, granted_by)
    select new.id, 'admin', invited_by
    from public.admin_invitations where id = invitation_id
    on conflict do nothing;

    update public.admin_invitations
    set status = 'accepted', accepted_by = new.id, accepted_at = now()
    where id = invitation_id;
  end if;

  return new;
end;
$$;

create or replace function public.activate_admin_invitation(target_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_actor uuid;
  invitation_email text;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  update public.admin_invitations
  set delivery_confirmed_at = now()
  where id = target_invitation_id
    and status = 'pending'
    and delivery_confirmed_at is null
    and expires_at > now()
  returning invited_by, email into invitation_actor, invitation_email;

  if invitation_actor is null then
    return false;
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id)
  values (invitation_actor, 'admin.invited', 'email', invitation_email);

  return true;
end;
$$;

create trigger on_auth_user_verified
after insert or update of email_confirmed_at on auth.users
for each row execute function public.accept_verified_admin_invitation();

create or replace function public.set_active_mode(requested_mode public.app_mode)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_profile public.profiles;
begin
  if requested_mode = 'professional' and not exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role in ('dentist', 'front_desk', 'clinic_manager', 'clinic_owner')
  ) then
    raise exception using errcode = '42501', message = 'PROFESSIONAL_ROLE_REQUIRED';
  end if;

  update public.profiles set active_mode = requested_mode where id = auth.uid()
  returning * into updated_profile;
  return updated_profile;
end;
$$;

create or replace function public.create_admin_invitation(
  invite_email text,
  invite_display_name text,
  expires_in_days integer default 7
)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if not public.has_role('super_admin') then
    raise exception using errcode = '42501', message = 'SUPER_ADMIN_REQUIRED';
  end if;
  if expires_in_days < 1 or expires_in_days > 30 then
    raise exception using errcode = '22023', message = 'INVALID_EXPIRY';
  end if;

  update public.admin_invitations as invitations
  set status = 'expired'
  where lower(invitations.email) = lower(trim(invite_email))
    and invitations.status = 'pending'
    and invitations.expires_at <= now();

  return query
  insert into public.admin_invitations as invitations (
    email, display_name, token_hash, invited_by, expires_at
  ) values (
    lower(trim(invite_email)),
    trim(invite_display_name),
    encode(extensions.digest(raw_token, 'sha256'), 'hex'),
    auth.uid(),
    now() + make_interval(days => expires_in_days)
  ) returning invitations.id, raw_token, invitations.expires_at;
end;
$$;

create or replace function public.bootstrap_super_admin(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  if not exists (
    select 1 from auth.users where id = target_user_id and email_confirmed_at is not null
  ) then
    raise exception using errcode = '22023', message = 'VERIFIED_USER_REQUIRED';
  end if;

  insert into public.user_roles (user_id, role, granted_by)
  values (target_user_id, 'super_admin', target_user_id)
  on conflict (user_id, role) do nothing;

  if not found then
    return;
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id)
  values (target_user_id, 'super_admin.bootstrapped', 'user', target_user_id::text);
end;
$$;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.admin_invitations enable row level security;
alter table public.app_configuration enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_read_self_or_admin"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles_update_self"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "roles_read_self_or_admin"
on public.user_roles for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "invitations_super_admin_read"
on public.admin_invitations for select to authenticated
using ((select public.has_role('super_admin')));

create policy "public_configuration_read"
on public.app_configuration for select to anon
using (is_public);

create policy "authenticated_configuration_read"
on public.app_configuration for select to authenticated
using (is_public or (select public.is_admin()));

create policy "configuration_super_admin_update"
on public.app_configuration for update to authenticated
using ((select public.has_role('super_admin')))
with check ((select public.has_role('super_admin')));

create policy "audit_admin_read"
on public.audit_logs for select to authenticated
using ((select public.is_admin()));

revoke all on table public.profiles, public.user_roles, public.admin_invitations,
  public.app_configuration, public.audit_logs from anon, authenticated;
grant select on table public.profiles, public.user_roles, public.admin_invitations,
  public.app_configuration, public.audit_logs to authenticated;
grant select on table public.app_configuration to anon;

revoke all on function public.bootstrap_super_admin(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_super_admin(uuid) to service_role;

revoke all on function public.activate_admin_invitation(uuid) from public, anon, authenticated;
grant execute on function public.activate_admin_invitation(uuid) to service_role;

revoke all on function public.create_admin_invitation(text, text, integer) from public, anon;
grant execute on function public.create_admin_invitation(text, text, integer) to authenticated;

revoke update on public.profiles from authenticated;
grant update (full_name, avatar_path, locale) on public.profiles to authenticated;
grant update (value, is_public, description) on public.app_configuration to authenticated;

revoke all on function public.write_audit(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.write_audit(text, text, text, jsonb) to service_role;

revoke all on function public.set_active_mode(public.app_mode) from public, anon;
grant execute on function public.set_active_mode(public.app_mode) to authenticated;

revoke all on function public.has_role(public.app_role) from public, anon;
grant execute on function public.has_role(public.app_role) to authenticated;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

revoke all on function public.touch_updated_at(), public.handle_new_user(),
  public.accept_verified_admin_invitation() from public, anon, authenticated;

commit;
