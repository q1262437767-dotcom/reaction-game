-- Test harness only. The rules under test come from upgrade-progress-guard.sql.
-- This file creates the roles, auth.uid() stub, and table that deployment
-- assumes already exist. It does not copy the guard.
drop schema if exists ruins_private cascade;
drop schema if exists auth cascade;
drop table if exists public.ruins_saves;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

create schema auth;
create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create schema ruins_private;

create table public.ruins_saves (
  user_id uuid primary key,
  profile jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default clock_timestamp()
);
