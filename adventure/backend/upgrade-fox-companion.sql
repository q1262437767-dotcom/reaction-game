-- Gray-tail fox companion support for existing v2 saves.
-- Run as the original function owner. Existing rows and privileges are preserved.
-- Standalone deployment SQL, not a Supabase CLI migration-history entry.
begin;

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
  v_camp jsonb;
  v_companion jsonb;
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
      or (select count(*) from jsonb_object_keys(p_profile)) not in (9, 10)
      or exists (select 1 from jsonb_object_keys(p_profile) as keys(id)
                 where id not in ('v','coins','wins','runs','scatter','clearedRuns','missions','badges','relics','camp'))
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
      or (select count(*) from jsonb_object_keys(p_profile->'missions')) not in (3, 4)
      or exists (select 1 from jsonb_object_keys(p_profile->'missions') as keys(id)
                 where id not in ('ember', 'salvage', 'holdout', 'chapter1')) then
    raise exception using errcode = '22023', message = 'invalid_profile';
  end if;
  for v_key in select jsonb_object_keys(p_profile->'missions') loop
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
      or jsonb_array_length(p_profile->'relics') > 6 then
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
        or (v_item #>> '{}') not in ('pierce','swift','vigor','resonance','riposte','decoy') then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
  end loop;
  if (select count(*) <> count(distinct value) from jsonb_array_elements(p_profile->'badges'))
      or (select count(*) <> count(distinct value) from jsonb_array_elements(p_profile->'relics')) then
    raise exception using errcode = '22023', message = 'invalid_profile';
  end if;

  -- Older v2 clients send the original nine fields. New clients may also store
  -- a bounded camp record; no account identity or per-run state belongs in it.
  if p_profile ? 'camp' then
    v_camp := p_profile->'camp';
    if jsonb_typeof(v_camp) is distinct from 'object' then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
    if not (v_camp ?& array['upgrades','startingRelic'])
        or (select count(*) from jsonb_object_keys(v_camp)) not in (2, 3)
        or exists (select 1 from jsonb_object_keys(v_camp) as keys(id)
                   where id not in ('upgrades', 'startingRelic', 'companion'))
        or jsonb_typeof(v_camp->'upgrades') is distinct from 'array' then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
    if jsonb_array_length(v_camp->'upgrades') > 3 then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
    for v_item in select value from jsonb_array_elements(v_camp->'upgrades') loop
      if jsonb_typeof(v_item) is distinct from 'string'
          or (v_item #>> '{}') not in ('ward','stride','relicCase') then
        raise exception using errcode = '22023', message = 'invalid_profile';
      end if;
    end loop;
    if (select count(*) <> count(distinct value) from jsonb_array_elements(v_camp->'upgrades')) then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
    if v_camp->'startingRelic' is distinct from 'null'::jsonb then
      if jsonb_typeof(v_camp->'startingRelic') is distinct from 'string'
          or (v_camp->>'startingRelic') not in ('pierce','swift','vigor','resonance','riposte','decoy')
          or not ((v_camp->'upgrades') ? 'relicCase')
          or not ((p_profile->'relics') ? (v_camp->>'startingRelic')) then
        raise exception using errcode = '22023', message = 'invalid_profile';
      end if;
    end if;
  end if;

  -- Companion ownership remains nested in the existing v2 camp record.
  -- Older clients may omit it; supplied values must be canonical and bounded.
  if p_profile ? 'camp' and (v_camp ? 'companion') then
    v_companion := v_camp->'companion';
    if jsonb_typeof(v_companion) is distinct from 'object' then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
    if not (v_companion ?& array['rescued','name','equipped'])
        or (select count(*) from jsonb_object_keys(v_companion)) <> 3
        or jsonb_typeof(v_companion->'rescued') is distinct from 'boolean'
        or jsonb_typeof(v_companion->'equipped') is distinct from 'boolean'
        or jsonb_typeof(v_companion->'name') is distinct from 'string' then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
    if (v_companion->>'name') <> btrim(v_companion->>'name')
        or (v_companion->>'name') collate "C" !~ '^[㐀-鿿A-Za-z0-9 ·_-]{1,12}$'
        or v_companion->'rescued' = 'false'::jsonb and
           (v_companion->>'name' <> '灰尾狐' or v_companion->'equipped' <> 'false'::jsonb) then
      raise exception using errcode = '22023', message = 'invalid_profile';
    end if;
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
      -- Missing fields in older clients must not erase newer same-owner records.
      -- Retain an equipped relic's discovery too, keeping the preserved camp valid.
      set profile = (case when not ((p_profile->'missions') ? 'chapter1') and ((saved.profile->'missions') ? 'chapter1')
                          then jsonb_set(p_profile, '{missions,chapter1}', saved.profile#>'{missions,chapter1}')
                          else p_profile end)
                    || (case when not (p_profile ? 'camp') and (saved.profile ? 'camp')
                             then jsonb_build_object('camp', saved.profile->'camp')
                             else '{}'::jsonb end)
                    || (case when p_profile ? 'camp' and not ((p_profile->'camp') ? 'companion')
                                  and (saved.profile#>'{camp,companion}') is not null
                             then jsonb_build_object('camp', (p_profile->'camp') ||
                                  jsonb_build_object('companion', saved.profile#>'{camp,companion}'))
                             else '{}'::jsonb end)
                    || (case when not (p_profile ? 'camp') and (saved.profile ? 'camp')
                                  and jsonb_typeof(saved.profile#>'{camp,startingRelic}') = 'string'
                                  and not ((p_profile->'relics') ? (saved.profile#>>'{camp,startingRelic}'))
                             then jsonb_build_object('relics', (p_profile->'relics') || jsonb_build_array(saved.profile#>>'{camp,startingRelic}'))
                             else '{}'::jsonb end),
          revision = saved.revision + 1, updated_at = clock_timestamp()
      where saved.user_id = v_user_id and saved.revision = p_expected_revision
      returning saved.profile, saved.revision, saved.updated_at;
  end if;
  if not found then
    raise exception using errcode = 'P0001', message = 'save_conflict';
  end if;
end;
$function$;

notify pgrst, 'reload schema';
commit;
