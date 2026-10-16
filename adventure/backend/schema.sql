-- Ruins Squad cloud backup v1. Run as the Supabase project database owner.
-- Re-running preserves saves. Only this game's table, policies and RPC are changed.
begin;

create table if not exists public.ruins_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  constraint ruins_saves_profile_object check (
    jsonb_typeof(profile) = 'object' and octet_length(profile::text) <= 32768
  )
);

alter table public.ruins_saves enable row level security;

-- The browser can read its own save. All writes go through the CAS RPC below.
-- Revoke column privileges too, in case an earlier manual setup granted them.
revoke all on table public.ruins_saves from public, anon, authenticated;
revoke select (user_id, profile, revision, updated_at),
       insert (user_id, profile, revision, updated_at),
       update (user_id, profile, revision, updated_at),
       references (user_id, profile, revision, updated_at)
  on public.ruins_saves from public, anon, authenticated;
grant select on table public.ruins_saves to authenticated;

drop policy if exists ruins_saves_own_select on public.ruins_saves;
create policy ruins_saves_own_select on public.ruins_saves
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- A restrictive ownership guard remains effective if another permissive policy
-- was added manually to this table. It does not grant direct write privileges.
drop policy if exists ruins_saves_owner_guard on public.ruins_saves;
create policy ruins_saves_owner_guard on public.ruins_saves
  as restrictive for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Keep privileged implementation outside the exposed public API schema.
create schema if not exists ruins_private;
revoke all on schema ruins_private from public, anon, authenticated;
grant usage on schema ruins_private to authenticated;

create or replace function ruins_private.save_ruins_profile_impl(
  p_profile jsonb,
  p_expected_revision bigint
)
returns table (profile jsonb, revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_item jsonb;
  v_mission jsonb;
  v_count numeric;
begin
  -- Identity comes from the verified JWT, never from a client-supplied user ID.
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'auth_required';
  end if;
  if p_expected_revision is null or p_expected_revision < 0
      or p_expected_revision >= 9007199254740991 then
    raise exception using errcode = '22023', message = 'invalid_revision';
  end if;

  -- Keep only the current game's bounded v2 profile. No email, token or user ID
  -- belongs here. These checks validate shape, not honest gameplay outcomes.
  if p_profile is null or jsonb_typeof(p_profile) is distinct from 'object'
      or octet_length(p_profile::text) > 32768 then
    raise exception using errcode = '22023', message = 'invalid_profile';
  end if;
  if not (p_profile ?& array['v','coins','wins','runs','scatter',
                            'clearedRuns','missions','badges','relics'])
      or (select count(*) from jsonb_object_keys(p_profile)) <> 9
      or p_profile->'v' is distinct from '2'::jsonb
      or jsonb_typeof(p_profile->'scatter') is distinct from 'boolean' then
    raise exception using errcode = '22023', message = 'invalid_profile';
  end if;
  foreach v_key in array array['coins','wins','runs'] loop
    if jsonb_typeof(p_profile->v_key) is distinct from 'number' then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
    v_count := (p_profile->>v_key)::numeric;
    if v_count < 0 or v_count > 1000000 or trunc(v_count) <> v_count then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
  end loop;
  if (p_profile->>'runs')::numeric < (p_profile->>'wins')::numeric then
    raise exception using errcode = '22023', message = 'invalid_profile';
  end if;

  if jsonb_typeof(p_profile->'clearedRuns') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'invalid_profile';
  end if;
  if jsonb_array_length(p_profile->'clearedRuns') > 80 then
    raise exception using errcode = '22023', message = 'invalid_profile';
  end if;
  for v_item in select value from jsonb_array_elements(p_profile->'clearedRuns') loop
    if jsonb_typeof(v_item) is distinct from 'string'
        or char_length(v_item #>> '{}') not between 1 and 160 then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
  end loop;
  if (select count(*) <> count(distinct value)
      from jsonb_array_elements(p_profile->'clearedRuns')) then
    raise exception using errcode = '22023', message = 'invalid_profile';
  end if;

  if jsonb_typeof(p_profile->'missions') is distinct from 'object' then
    raise exception using errcode = '22023', message = 'invalid_profile';
  end if;
  if not ((p_profile->'missions') ?& array['ember','salvage','holdout'])
      or (select count(*) from jsonb_object_keys(p_profile->'missions')) <> 3 then
    raise exception using errcode = '22023', message = 'invalid_profile';
  end if;
  foreach v_key in array array['ember','salvage','holdout'] loop
    v_mission := p_profile->'missions'->v_key;
    if jsonb_typeof(v_mission) is distinct from 'object' then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
    if not (v_mission ?& array['clears','hardClears','bestTime'])
        or (select count(*) from jsonb_object_keys(v_mission)) <> 3 then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
    if jsonb_typeof(v_mission->'clears') is distinct from 'number'
        or jsonb_typeof(v_mission->'hardClears') is distinct from 'number' then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
    v_count := (v_mission->>'clears')::numeric;
    if v_count < 0 or v_count > 1000000 or trunc(v_count) <> v_count then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
    v_count := (v_mission->>'hardClears')::numeric;
    if v_count < 0 or v_count > (v_mission->>'clears')::numeric
        or trunc(v_count) <> v_count then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
    if v_mission->'bestTime' is distinct from 'null'::jsonb then
      if jsonb_typeof(v_mission->'bestTime') is distinct from 'number' then
        raise exception using errcode = '22023', message = 'invalid_profile';
      end if;
      v_count := (v_mission->>'bestTime')::numeric;
      if v_count < 0 or v_count > 86400 then
        raise exception using errcode = '22023', message = 'invalid_profile';
      end if;
    end if;
  end loop;

  if jsonb_typeof(p_profile->'badges') is distinct from 'array'
      or jsonb_typeof(p_profile->'relics') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'invalid_profile';
  end if;
  if jsonb_array_length(p_profile->'badges') > 5
      or jsonb_array_length(p_profile->'relics') > 3 then
    raise exception using errcode = '22023', message = 'invalid_profile';
  end if;
  for v_item in select value from jsonb_array_elements(p_profile->'badges') loop
    if jsonb_typeof(v_item) is distinct from 'string'
        or (v_item #>> '{}') not in ('flawless','explorer','lamplighter','collector','veteran') then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(p_profile->'relics') loop
    if jsonb_typeof(v_item) is distinct from 'string'
        or (v_item #>> '{}') not in ('pierce','swift','vigor') then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
  end loop;
  if (select count(*) <> count(distinct value) from jsonb_array_elements(p_profile->'badges'))
      or (select count(*) <> count(distinct value) from jsonb_array_elements(p_profile->'relics')) then
    raise exception using errcode = '22023', message = 'invalid_profile';
  end if;

  -- Each single statement is atomic. A racing initial insert cannot replace a
  -- save, and a stale update cannot pass its revision predicate after waiting.
  if p_expected_revision = 0 then
    return query
      insert into public.ruins_saves as saved (user_id, profile, revision, updated_at)
      values (v_user_id, p_profile, 1, clock_timestamp())
      on conflict (user_id) do nothing
      returning saved.profile, saved.revision, saved.updated_at;
  else
    return query
      update public.ruins_saves as saved
      set profile = p_profile, revision = saved.revision + 1, updated_at = clock_timestamp()
      where saved.user_id = v_user_id and saved.revision = p_expected_revision
      returning saved.profile, saved.revision, saved.updated_at;
  end if;
  if not found then
    raise exception using errcode = 'P0001', message = 'save_conflict';
  end if;
end;
$function$;

revoke all on function ruins_private.save_ruins_profile_impl(jsonb, bigint) from public, anon, authenticated;
grant execute on function ruins_private.save_ruins_profile_impl(jsonb, bigint) to authenticated;

-- The exposed RPC itself has no elevated privileges.
create or replace function public.save_ruins_profile(
  p_profile jsonb,
  p_expected_revision bigint
)
returns table (profile jsonb, revision bigint, updated_at timestamptz)
language sql
security invoker
set search_path = ''
as $wrapper$
  select * from ruins_private.save_ruins_profile_impl(p_profile, p_expected_revision);
$wrapper$;

-- New functions otherwise inherit PUBLIC EXECUTE. Narrow both explicitly.
revoke all on function public.save_ruins_profile(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.save_ruins_profile(jsonb, bigint) to authenticated;

notify pgrst, 'reload schema';
commit;
