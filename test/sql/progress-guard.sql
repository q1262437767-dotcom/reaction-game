-- Cases for ruins_private.save_ruins_profile_impl after the latest upgrades.
-- Revision 0 is the first insert and skips the jump check. Later revisions
-- must accept a normal expedition, reject a regression, and reject a spike.
begin;

create or replace function pg_temp.mission(clears numeric, hard numeric, best numeric)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('clears', clears, 'hardClears', hard, 'bestTime', to_jsonb(best));
$$;

create or replace function pg_temp.profile(
  p_coins numeric,
  p_wins numeric,
  p_runs numeric,
  p_scatter boolean,
  p_ids jsonb,
  p_ember jsonb,
  p_salvage jsonb,
  p_holdout jsonb,
  p_chapter1 jsonb default null,
  p_badges jsonb default '[]'::jsonb,
  p_relics jsonb default '[]'::jsonb,
  p_upgrades jsonb default null,
  p_rescued boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  missions jsonb := jsonb_build_object('ember', p_ember, 'salvage', p_salvage, 'holdout', p_holdout);
  result jsonb;
begin
  if p_chapter1 is not null then
    missions := missions || jsonb_build_object('chapter1', p_chapter1);
  end if;
  result := jsonb_build_object(
    'v', 2,
    'coins', p_coins,
    'wins', p_wins,
    'runs', p_runs,
    'scatter', p_scatter,
    'clearedRuns', p_ids,
    'missions', missions,
    'badges', p_badges,
    'relics', p_relics
  );
  if p_upgrades is not null then
    result := result || jsonb_build_object('camp', jsonb_build_object(
      'upgrades', p_upgrades,
      'startingRelic', 'null'::jsonb,
      'companion', jsonb_build_object(
        'rescued', p_rescued,
        'name', '灰尾狐',
        'equipped', false
      )
    ));
  end if;
  return result;
end;
$$;

create or replace function pg_temp.zero_mission()
returns jsonb
language sql
immutable
as $$ select pg_temp.mission(0, 0, null); $$;

create or replace function pg_temp.expect_rejected(p_profile jsonb, p_revision bigint, p_label text)
returns void
language plpgsql
as $$
begin
  perform * from ruins_private.save_ruins_profile_impl(p_profile, p_revision);
  raise exception '%: expected progress_rejected but the save was stored', p_label;
exception
  when sqlstate '22023' then
    if sqlerrm is distinct from 'progress_rejected' then
      raise exception '%: expected progress_rejected, got %', p_label, sqlerrm;
    end if;
end;
$$;

do $$
declare
  v_row record;
  v_def text;
  v_base jsonb;
  v_next jsonb;
  v_third jsonb;
begin
  v_def := pg_get_functiondef('ruins_private.reject_ruins_progress_jump(jsonb,jsonb)'::regprocedure);
  if position('v_run_delta > 480' in v_def) = 0 or position('progress_rejected' in v_def) = 0 then
    raise exception 'reject_ruins_progress_jump is not the deployment guard';
  end if;

  -- First save: a developed guest camp is shape-checked only.
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', true);
  v_base := pg_temp.profile(
    100000, 2, 2, true, '["r1","r2"]'::jsonb,
    pg_temp.mission(1, 0, 50), pg_temp.mission(1, 0, 40), pg_temp.zero_mission(),
    pg_temp.mission(1, 0, 90), '["explorer"]'::jsonb, '["pierce"]'::jsonb, '["ward"]'::jsonb, true
  );
  select * into v_row from ruins_private.save_ruins_profile_impl(v_base, 0);
  if v_row.revision is distinct from 1 or (v_row.profile->>'coins')::numeric is distinct from 100000 then
    raise exception 'first save did not store the guest profile at revision 1';
  end if;

  -- Spike: 0 new wins cannot explain another 100000 coins, or 481 new runs.
  perform pg_temp.expect_rejected(
    pg_temp.profile(200000, 2, 2, true, '["r1","r2"]'::jsonb,
      pg_temp.mission(1, 0, 50), pg_temp.mission(1, 0, 40), pg_temp.zero_mission(),
      pg_temp.mission(1, 0, 90), '["explorer"]'::jsonb, '["pierce"]'::jsonb, '["ward"]'::jsonb, true),
    1, 'coin spike');
  perform pg_temp.expect_rejected(
    pg_temp.profile(100000, 2, 483, true, '["r1","r2","r3"]'::jsonb,
      pg_temp.mission(1, 0, 50), pg_temp.mission(1, 0, 40), pg_temp.zero_mission(),
      pg_temp.mission(1, 0, 90), '["explorer"]'::jsonb, '["pierce"]'::jsonb, '["ward"]'::jsonb, true),
    1, 'run spike');

  -- Regression: coins, wins, badges, scatter, fox, clears, and a worse time.
  perform pg_temp.expect_rejected(
    pg_temp.profile(99999, 2, 2, true, '["r1","r2"]'::jsonb,
      pg_temp.mission(1, 0, 50), pg_temp.mission(1, 0, 40), pg_temp.zero_mission(),
      pg_temp.mission(1, 0, 90), '["explorer"]'::jsonb, '["pierce"]'::jsonb, '["ward"]'::jsonb, true),
    1, 'coin regression');
  perform pg_temp.expect_rejected(
    pg_temp.profile(100000, 1, 2, true, '["r1","r2"]'::jsonb,
      pg_temp.mission(1, 0, 50), pg_temp.mission(1, 0, 40), pg_temp.zero_mission(),
      pg_temp.mission(1, 0, 90), '["explorer"]'::jsonb, '["pierce"]'::jsonb, '["ward"]'::jsonb, true),
    1, 'win regression');
  perform pg_temp.expect_rejected(
    pg_temp.profile(100000, 2, 2, true, '["r1","r2"]'::jsonb,
      pg_temp.mission(1, 0, 50), pg_temp.mission(1, 0, 40), pg_temp.zero_mission(),
      pg_temp.mission(1, 0, 90), '[]'::jsonb, '["pierce"]'::jsonb, '["ward"]'::jsonb, true),
    1, 'badge regression');
  perform pg_temp.expect_rejected(
    pg_temp.profile(100000, 2, 2, false, '["r1","r2"]'::jsonb,
      pg_temp.mission(1, 0, 50), pg_temp.mission(1, 0, 40), pg_temp.zero_mission(),
      pg_temp.mission(1, 0, 90), '["explorer"]'::jsonb, '["pierce"]'::jsonb, '["ward"]'::jsonb, true),
    1, 'scatter regression');
  perform pg_temp.expect_rejected(
    pg_temp.profile(100000, 2, 2, true, '["r1","r2"]'::jsonb,
      pg_temp.mission(1, 0, 50), pg_temp.mission(1, 0, 40), pg_temp.zero_mission(),
      pg_temp.mission(1, 0, 90), '["explorer"]'::jsonb, '["pierce"]'::jsonb, '["ward"]'::jsonb, false),
    1, 'fox regression');
  perform pg_temp.expect_rejected(
    pg_temp.profile(100000, 2, 2, true, '["r1","r2"]'::jsonb,
      pg_temp.mission(0, 0, 50), pg_temp.mission(1, 0, 40), pg_temp.zero_mission(),
      pg_temp.mission(1, 0, 90), '["explorer"]'::jsonb, '["pierce"]'::jsonb, '["ward"]'::jsonb, true),
    1, 'clear regression');
  perform pg_temp.expect_rejected(
    pg_temp.profile(100072, 3, 3, true, '["r1","r2","r3"]'::jsonb,
      pg_temp.mission(2, 0, 80), pg_temp.mission(1, 0, 40), pg_temp.zero_mission(),
      pg_temp.mission(1, 0, 90), '["explorer"]'::jsonb, '["pierce"]'::jsonb, '["ward"]'::jsonb, true),
    1, 'worse best time');

  if (select revision from public.ruins_saves) is distinct from 1 then
    raise exception 'a rejected save changed the stored revision';
  end if;

  -- Allowed: one new run and win, the richest honest 72 coins, a better time.
  v_next := pg_temp.profile(
    100072, 3, 3, true, '["r1","r2","r3"]'::jsonb,
    pg_temp.mission(2, 1, 30), pg_temp.mission(1, 0, 40), pg_temp.zero_mission(),
    pg_temp.mission(1, 0, 90), '["explorer"]'::jsonb, '["pierce"]'::jsonb, '["ward"]'::jsonb, true
  );
  select * into v_row from ruins_private.save_ruins_profile_impl(v_next, 1);
  if v_row.revision is distinct from 2
     or (v_row.profile->>'coins')::numeric is distinct from 100072
     or (v_row.profile->>'wins')::numeric is distinct from 3 then
    raise exception 'allowed expedition was not stored at revision 2';
  end if;

  -- A fresh account can upload an empty camp, then a 100000-coin jump is still a spike.
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', true);
  v_base := pg_temp.profile(
    0, 0, 0, false, '[]'::jsonb,
    pg_temp.zero_mission(), pg_temp.zero_mission(), pg_temp.zero_mission()
  );
  select * into v_row from ruins_private.save_ruins_profile_impl(v_base, 0);
  if v_row.revision is distinct from 1 then
    raise exception 'empty first save failed';
  end if;
  perform pg_temp.expect_rejected(
    pg_temp.profile(100000, 0, 0, false, '[]'::jsonb,
      pg_temp.zero_mission(), pg_temp.zero_mission(), pg_temp.zero_mission()),
    1, 'zero to 100000');

  -- No new win: buying scatter spends exactly 30 and is allowed.
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', true);
  v_base := pg_temp.profile(
    30, 0, 1, false, '["r1"]'::jsonb,
    pg_temp.zero_mission(), pg_temp.zero_mission(), pg_temp.zero_mission()
  );
  perform ruins_private.save_ruins_profile_impl(v_base, 0);
  v_next := pg_temp.profile(
    0, 0, 1, true, '["r1"]'::jsonb,
    pg_temp.zero_mission(), pg_temp.zero_mission(), pg_temp.zero_mission()
  );
  select * into v_row from ruins_private.save_ruins_profile_impl(v_next, 1);
  if v_row.revision is distinct from 2 or (v_row.profile->>'scatter') is distinct from 'true'
     or (v_row.profile->>'coins')::numeric is distinct from 0 then
    raise exception 'scatter purchase was rejected';
  end if;
  perform pg_temp.expect_rejected(
    pg_temp.profile(1, 0, 1, true, '["r1"]'::jsonb,
      pg_temp.zero_mission(), pg_temp.zero_mission(), pg_temp.zero_mission()),
    2, 'scatter overspend');

  -- A co-op guest can finish the third section without any prior chapter
  -- record. Older clients can still save while omitting the new record.
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', true);
  v_base := pg_temp.profile(
    0, 0, 0, false, '[]'::jsonb,
    pg_temp.zero_mission(), pg_temp.zero_mission(), pg_temp.zero_mission()
  );
  perform ruins_private.save_ruins_profile_impl(v_base, 0);
  v_third := pg_temp.mission(1, 0, 48);
  v_next := pg_temp.profile(
    60, 1, 1, false, '["third"]'::jsonb,
    pg_temp.zero_mission(), pg_temp.zero_mission(), pg_temp.zero_mission()
  );
  v_next := jsonb_set(v_next, '{missions,chapter1_3}', v_third);
  perform pg_temp.expect_rejected(jsonb_set(v_next, '{coins}', '61'::jsonb), 1, 'third section coin ceiling');
  perform pg_temp.expect_rejected(
    jsonb_set(jsonb_set(v_next, '{wins}', '0'::jsonb), '{coins}', '0'::jsonb),
    1, 'third section clear without a win');
  begin
    perform ruins_private.save_ruins_profile_impl(jsonb_set(v_next, '{missions,chapter1_3,hardClears}', '1'::jsonb), 1);
    raise exception 'third section accepted a hard clear';
  exception when sqlstate '22023' then
    if sqlerrm is distinct from 'invalid_profile' then
      raise exception 'third section hard clear returned %', sqlerrm;
    end if;
  end;
  select * into v_row from ruins_private.save_ruins_profile_impl(v_next, 1);
  if v_row.revision is distinct from 2
     or v_row.profile#>'{missions,chapter1_3}' is distinct from v_third
     or v_row.profile->'missions' ? 'chapter1_2' then
    raise exception 'third section co-op clear did not persist independently';
  end if;
  select * into v_row from ruins_private.save_ruins_profile_impl(v_next #- '{missions,chapter1_3}', 2);
  if v_row.revision is distinct from 3 or v_row.profile#>'{missions,chapter1_3}' is distinct from v_third then
    raise exception 'legacy save lost the third section record';
  end if;
  perform pg_temp.expect_rejected(
    jsonb_set(v_next, '{missions,chapter1_3}', pg_temp.zero_mission()), 3, 'third section regression');
  perform pg_temp.expect_rejected(
    jsonb_set(v_next, '{missions,chapter1_3,bestTime}', '49'::jsonb), 3, 'third section worse time');

  v_next := pg_temp.profile(
    192, 3, 3, false, '["third","third-again","ember-hard"]'::jsonb,
    pg_temp.mission(1, 1, 25), pg_temp.zero_mission(), pg_temp.zero_mission()
  );
  v_next := jsonb_set(v_next, '{missions,chapter1_3}', pg_temp.mission(2, 0, 45));
  perform pg_temp.expect_rejected(jsonb_set(v_next, '{coins}', '193'::jsonb), 3, 'mixed chapter and story coin ceiling');
  select * into v_row from ruins_private.save_ruins_profile_impl(v_next, 3);
  if v_row.revision is distinct from 4 or v_row.profile is distinct from v_next then
    raise exception 'mixed third-section and richest story win was rejected';
  end if;
end;
$$;

rollback;
