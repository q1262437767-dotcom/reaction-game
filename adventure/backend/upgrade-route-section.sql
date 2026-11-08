-- Add the fourth story section to the existing v2 cloud-save contract.
-- Standalone deployment SQL. Run as the owner of the two existing private functions.
-- CREATE OR REPLACE preserves owners and grants. No save rows, tables, RLS
-- policies or public wrapper are changed. New projects use schema.sql.
begin;

create or replace function ruins_private.reject_ruins_progress_jump(
  p_old jsonb,
  p_new jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_old_coins numeric;
  v_new_coins numeric;
  v_old_wins numeric;
  v_new_wins numeric;
  v_old_runs numeric;
  v_new_runs numeric;
  v_run_delta numeric;
  v_win_delta numeric;
  v_spend numeric := 0;
  v_key text;
  v_old_mission jsonb;
  v_new_mission jsonb;
  v_old_clears numeric;
  v_new_clears numeric;
  v_old_hard numeric;
  v_new_hard numeric;
  v_old_time jsonb;
  v_new_time jsonb;
  v_clear_delta numeric;
  v_clear_sum numeric := 0;
  v_third_clear_delta numeric := 0;
  v_fourth_clear_delta numeric := 0;
  v_bad_window boolean;
  v_old_upgrades jsonb;
  v_new_upgrades jsonb;
begin
  -- Bounds below are acceptance limits for one save versus the stored row.
  -- They do not change the rewards the game itself pays out.
  --
  -- Profile coins gained on a win (campaign.js applyResult / engine.js finish):
  --   ember 40, salvage 30, holdout 35
  --   story hard +20, one cleared secret +12
  --   richest story win = 40 + 20 + 12 = 72
  --   chapter1 earns 40, chapter1_2 earns 50, chapter1_3 earns 60, chapter1_4 earns 70
  --   hunt 32, relay 24
  --   a loss or the practice arena adds no coins
  -- So each new win explains at most 72 coins. New wins cannot exceed new runs.
  --
  -- Unlocks are paid from coins in the same save that first records them:
  --   scatter 30, ward 40, stride 60, relicCase 80
  -- With no new win, the balance must fall by exactly that cost.
  -- With wins, it must sit in [old - cost, old + wins * 72 - cost].
  --
  -- 480 new runs is only the offline backlog ceiling. While online, account.js
  -- uploads about one expedition after a 650ms debounce, so a live save is
  -- +0 or +1 run. 480 five-minute runs is 40 hours. The largest coin jump is
  -- therefore 480 * 72 = 34560, which still rejects 0 → 100000 and 0 → 1000000.
  -- Revision 0 never reaches this function: the first cloud row, including a
  -- guest import onto an empty account, stays shape-checked only.
  --
  -- Still not authoritative: bestTime may improve all the way to 0, a new
  -- account can upload a fully developed guest camp once, and many legal
  -- saves can still grind. This is not a per-chapter settlement RPC.
  if jsonb_typeof(p_old->'coins') is distinct from 'number'
     or jsonb_typeof(p_old->'wins') is distinct from 'number'
     or jsonb_typeof(p_old->'runs') is distinct from 'number'
     or jsonb_typeof(p_old->'scatter') is distinct from 'boolean'
     or jsonb_typeof(p_old->'clearedRuns') is distinct from 'array'
     or jsonb_typeof(p_old->'missions') is distinct from 'object'
     or jsonb_typeof(p_old->'badges') is distinct from 'array'
     or jsonb_typeof(p_old->'relics') is distinct from 'array'
     or jsonb_typeof(p_new->'coins') is distinct from 'number'
     or jsonb_typeof(p_new->'wins') is distinct from 'number'
     or jsonb_typeof(p_new->'runs') is distinct from 'number' then
    raise exception using errcode = '22023', message = 'progress_rejected';
  end if;

  v_old_coins := (p_old->>'coins')::numeric;
  v_new_coins := (p_new->>'coins')::numeric;
  v_old_wins := (p_old->>'wins')::numeric;
  v_new_wins := (p_new->>'wins')::numeric;
  v_old_runs := (p_old->>'runs')::numeric;
  v_new_runs := (p_new->>'runs')::numeric;
  if trunc(v_old_coins) <> v_old_coins or trunc(v_old_wins) <> v_old_wins
     or trunc(v_old_runs) <> v_old_runs then
    raise exception using errcode = '22023', message = 'progress_rejected';
  end if;

  v_run_delta := v_new_runs - v_old_runs;
  v_win_delta := v_new_wins - v_old_wins;
  -- 480 expeditions, and no more wins than expeditions, in a single save.
  if v_run_delta < 0 or v_run_delta > 480 or v_win_delta < 0 or v_win_delta > v_run_delta then
    raise exception using errcode = '22023', message = 'progress_rejected';
  end if;

  if (p_old->>'scatter') = 'true' and (p_new->>'scatter') is distinct from 'true' then
    raise exception using errcode = '22023', message = 'progress_rejected';
  end if;
  if (p_old->>'scatter') is distinct from 'true' and (p_new->>'scatter') = 'true' then
    v_spend := v_spend + 30;
  end if;

  if p_old ? 'camp' and jsonb_typeof(p_old#>'{camp,upgrades}') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'progress_rejected';
  end if;
  v_old_upgrades := coalesce(p_old#>'{camp,upgrades}', '[]'::jsonb);
  v_new_upgrades := coalesce(p_new#>'{camp,upgrades}', '[]'::jsonb);
  if jsonb_typeof(v_new_upgrades) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'progress_rejected';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(v_old_upgrades) as item(id)
    where not (v_new_upgrades ? item.id)
  ) then
    raise exception using errcode = '22023', message = 'progress_rejected';
  end if;
  if (v_new_upgrades ? 'ward') and not (v_old_upgrades ? 'ward') then
    v_spend := v_spend + 40;
  end if;
  if (v_new_upgrades ? 'stride') and not (v_old_upgrades ? 'stride') then
    v_spend := v_spend + 60;
  end if;
  if (v_new_upgrades ? 'relicCase') and not (v_old_upgrades ? 'relicCase') then
    v_spend := v_spend + 80;
  end if;

  if v_new_coins < v_old_coins - v_spend then
    raise exception using errcode = '22023', message = 'progress_rejected';
  end if;

  foreach v_key in array array['ember','salvage','holdout','chapter1','chapter1_2','chapter1_3','chapter1_4'] loop
    v_old_mission := p_old->'missions'->v_key;
    v_new_mission := p_new->'missions'->v_key;
    if v_old_mission is null then
      v_old_clears := 0;
      v_old_hard := 0;
      v_old_time := 'null'::jsonb;
    elsif jsonb_typeof(v_old_mission) is distinct from 'object'
       or jsonb_typeof(v_old_mission->'clears') is distinct from 'number'
       or jsonb_typeof(v_old_mission->'hardClears') is distinct from 'number' then
      raise exception using errcode = '22023', message = 'progress_rejected';
    else
      v_old_clears := (v_old_mission->>'clears')::numeric;
      v_old_hard := (v_old_mission->>'hardClears')::numeric;
      v_old_time := v_old_mission->'bestTime';
      if v_old_time is null then
        v_old_time := 'null'::jsonb;
      end if;
    end if;
    if v_new_mission is null then
      v_new_clears := 0;
      v_new_hard := 0;
      v_new_time := 'null'::jsonb;
    elsif jsonb_typeof(v_new_mission) is distinct from 'object'
       or jsonb_typeof(v_new_mission->'clears') is distinct from 'number'
       or jsonb_typeof(v_new_mission->'hardClears') is distinct from 'number' then
      raise exception using errcode = '22023', message = 'progress_rejected';
    else
      v_new_clears := (v_new_mission->>'clears')::numeric;
      v_new_hard := (v_new_mission->>'hardClears')::numeric;
      v_new_time := v_new_mission->'bestTime';
      if v_new_time is null then
        v_new_time := 'null'::jsonb;
      end if;
    end if;
    if trunc(v_old_clears) <> v_old_clears or trunc(v_old_hard) <> v_old_hard
       or v_new_clears < v_old_clears then
      raise exception using errcode = '22023', message = 'progress_rejected';
    end if;
    v_clear_delta := v_new_clears - v_old_clears;
    -- Chapter sections have no hard mode. Story hard clears cannot outrun
    -- that mission's new clears, and cannot fall.
    if v_key in ('chapter1', 'chapter1_2', 'chapter1_3', 'chapter1_4') then
      if v_new_hard <> v_old_hard then
        raise exception using errcode = '22023', message = 'progress_rejected';
      end if;
    elsif v_new_hard < v_old_hard or v_new_hard > v_old_hard + v_clear_delta then
      raise exception using errcode = '22023', message = 'progress_rejected';
    end if;
    if v_old_time <> 'null'::jsonb and jsonb_typeof(v_old_time) is distinct from 'number' then
      raise exception using errcode = '22023', message = 'progress_rejected';
    end if;
    -- A smaller bestTime is a better time. It can change only when that
    -- mission records at least one new clear, and it cannot be erased.
    if v_clear_delta = 0 then
      if v_new_time is distinct from v_old_time then
        raise exception using errcode = '22023', message = 'progress_rejected';
      end if;
    elsif v_old_time <> 'null'::jsonb then
      if v_new_time = 'null'::jsonb or jsonb_typeof(v_new_time) is distinct from 'number'
         or (v_new_time #>> '{}')::numeric > (v_old_time #>> '{}')::numeric then
        raise exception using errcode = '22023', message = 'progress_rejected';
      end if;
    end if;
    v_clear_sum := v_clear_sum + v_clear_delta;
    if v_key = 'chapter1_3' then
      v_third_clear_delta := v_clear_delta;
    elsif v_key = 'chapter1_4' then
      v_fourth_clear_delta := v_clear_delta;
    end if;
  end loop;
  -- Hunt and relay wins do not increment a mission clear, so clears may lag wins.
  -- Third/fourth-section clears explain 60/70 coins each; other wins retain the
  -- existing global ceiling of 72 (ember + hard + secret).
  if v_clear_sum > v_win_delta
     or v_new_coins > v_old_coins + v_third_clear_delta * 60
                    + v_fourth_clear_delta * 70
                    + (v_win_delta - v_third_clear_delta - v_fourth_clear_delta) * 72 - v_spend then
    raise exception using errcode = '22023', message = 'progress_rejected';
  end if;

  if exists (
    select 1 from jsonb_array_elements_text(p_old->'badges') as item(id)
    where not (p_new->'badges' ? item.id)
  ) or exists (
    select 1 from jsonb_array_elements_text(p_old->'relics') as item(id)
    where not (p_new->'relics' ? item.id)
  ) then
    raise exception using errcode = '22023', message = 'progress_rejected';
  end if;
  -- Discoveries are written by applyResult on an expedition, not from camp.
  if v_run_delta < 1 and (
    exists (
      select 1 from jsonb_array_elements_text(p_new->'badges') as item(id)
      where not (p_old->'badges' ? item.id)
    ) or exists (
      select 1 from jsonb_array_elements_text(p_new->'relics') as item(id)
      where not (p_old->'relics' ? item.id)
    )
  ) then
    raise exception using errcode = '22023', message = 'progress_rejected';
  end if;

  if coalesce(p_old#>'{camp,companion,rescued}', 'false'::jsonb) = 'true'::jsonb
     and coalesce(p_new#>'{camp,companion,rescued}', 'false'::jsonb) is distinct from 'true'::jsonb then
    raise exception using errcode = '22023', message = 'progress_rejected';
  end if;
  if coalesce(p_new#>'{camp,companion,rescued}', 'false'::jsonb) = 'true'::jsonb
     and coalesce(p_old#>'{camp,companion,rescued}', 'false'::jsonb) is distinct from 'true'::jsonb
     and v_run_delta < 1 then
    raise exception using errcode = '22023', message = 'progress_rejected';
  end if;

  -- clearedRuns is the last 80 expedition ids, not a permanent unlock list.
  -- A save may drop a prefix and append new ids. It may not reorder, rewrite,
  -- or keep the list frozen while runs increase.
  if v_run_delta = 0 then
    if (p_new->'clearedRuns') is distinct from (p_old->'clearedRuns') then
      raise exception using errcode = '22023', message = 'progress_rejected';
    end if;
  else
    with new_items as (
      select cleared.id, cleared.pos
      from jsonb_array_elements(p_new->'clearedRuns') with ordinality as cleared(id, pos)
    ),
    old_items as (
      select cleared.id, cleared.pos
      from jsonb_array_elements(p_old->'clearedRuns') with ordinality as cleared(id, pos)
    ),
    marked as (
      select new_items.pos, new_items.id,
             not exists (
               select 1 from old_items where old_items.id = new_items.id
             ) as fresh
      from new_items
    ),
    head as (
      select pos, id from marked where not fresh
    ),
    suffix as (
      select old_items.id, row_number() over (order by old_items.pos) as pos
      from old_items
      where old_items.pos > (select count(*) from old_items) - (select count(*) from head)
    )
    select
      coalesce((select count(*) from marked where fresh), 0) > v_run_delta
      or coalesce((
        select bool_or(earlier.fresh and not later.fresh)
        from marked as earlier
        join marked as later on earlier.pos < later.pos
      ), false)
      or exists (
        select 1 from head
        full join suffix on head.pos = suffix.pos
        where head.id is distinct from suffix.id
      )
      or not coalesce((select fresh from marked order by pos desc limit 1), false)
    into v_bad_window;
    if v_bad_window is distinct from false then
      raise exception using errcode = '22023', message = 'progress_rejected';
    end if;
  end if;
end;
$function$;

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
  v_stored jsonb;
  v_effective jsonb;
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
  -- belongs here. Every write is shape-checked. An update is then compared with
  -- the stored row; a revision 0 insert is not.
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
      or (select count(*) from jsonb_object_keys(p_profile->'missions')) not in (3, 4, 5, 6, 7)
      or exists (select 1 from jsonb_object_keys(p_profile->'missions') as keys(id)
                 where id not in ('ember', 'salvage', 'holdout', 'chapter1', 'chapter1_2', 'chapter1_3', 'chapter1_4')) then
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
        or trunc(v_count) <> v_count
        or (v_key in ('chapter1_3', 'chapter1_4') and v_count <> 0) then
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
  -- Revision 0 is the first insert and is not compared with an older profile.
  if p_expected_revision = 0 then
    return query
      insert into public.ruins_saves as saved (user_id, profile, revision, updated_at)
      values (v_user_id, p_profile, 1, clock_timestamp())
      on conflict (user_id) do nothing
      returning saved.profile, saved.revision, saved.updated_at;
  else
    select saved.profile into v_stored
    from public.ruins_saves as saved
    where saved.user_id = v_user_id and saved.revision = p_expected_revision
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'save_conflict';
    end if;
    -- Missing fields in older clients must not erase newer same-owner records.
    -- Retain an equipped relic's discovery too, keeping the preserved camp valid.
    v_effective := p_profile || jsonb_build_object('missions', (p_profile->'missions')
                  || (case when not ((p_profile->'missions') ? 'chapter1') and ((v_stored->'missions') ? 'chapter1')
                           then jsonb_build_object('chapter1', v_stored#>'{missions,chapter1}')
                           else '{}'::jsonb end)
                  || (case when not ((p_profile->'missions') ? 'chapter1_2') and ((v_stored->'missions') ? 'chapter1_2')
                           then jsonb_build_object('chapter1_2', v_stored#>'{missions,chapter1_2}')
                           else '{}'::jsonb end)
                  || (case when not ((p_profile->'missions') ? 'chapter1_3') and ((v_stored->'missions') ? 'chapter1_3')
                           then jsonb_build_object('chapter1_3', v_stored#>'{missions,chapter1_3}')
                           else '{}'::jsonb end)
                  || (case when not ((p_profile->'missions') ? 'chapter1_4') and ((v_stored->'missions') ? 'chapter1_4')
                           then jsonb_build_object('chapter1_4', v_stored#>'{missions,chapter1_4}')
                           else '{}'::jsonb end))
                  || (case when not (p_profile ? 'camp') and (v_stored ? 'camp')
                           then jsonb_build_object('camp', v_stored->'camp')
                           else '{}'::jsonb end)
                  || (case when p_profile ? 'camp' and not ((p_profile->'camp') ? 'companion')
                                and (v_stored#>'{camp,companion}') is not null
                           then jsonb_build_object('camp', (p_profile->'camp') ||
                                jsonb_build_object('companion', v_stored#>'{camp,companion}'))
                           else '{}'::jsonb end)
                  || (case when not (p_profile ? 'camp') and (v_stored ? 'camp')
                                and jsonb_typeof(v_stored#>'{camp,startingRelic}') = 'string'
                                and not ((p_profile->'relics') ? (v_stored#>>'{camp,startingRelic}'))
                           then jsonb_build_object('relics', (p_profile->'relics') || jsonb_build_array(v_stored#>>'{camp,startingRelic}'))
                           else '{}'::jsonb end);
    perform ruins_private.reject_ruins_progress_jump(v_stored, v_effective);
    return query
      update public.ruins_saves as saved
      set profile = v_effective, revision = saved.revision + 1, updated_at = clock_timestamp()
      where saved.user_id = v_user_id and saved.revision = p_expected_revision
      returning saved.profile, saved.revision, saved.updated_at;
  end if;
  if not found then
    raise exception using errcode = 'P0001', message = 'save_conflict';
  end if;
end;
$function$;

commit;
