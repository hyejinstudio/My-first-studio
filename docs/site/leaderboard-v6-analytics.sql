-- 순위표 v6: 방문·플레이 통계 + 관리자 전용 통계 (Supabase SQL Editor에 통째로 붙여넣고 Run)
-- v1 ~ v5 위에 Run. 여러 번 Run해도 안전(기존 통계·비밀번호는 지워지지 않음).
--
-- 실행 뒤 관리자 비밀번호 정하기 (SQL Editor에서만, 8자 이상):
--   select public.admin_set_password('여기에-비밀번호');
-- 비밀번호는 bcrypt 해시로만 저장된다. 잊으면 같은 명령으로 다시 정하면 된다(잠금도 풀린다).
--
-- 모으는 것: 무작위 기기 번호(이미 순위표에 쓰는 것), 어느 페이지를 열었는지, 어떤 게임을 끝까지 했는지,
--           그때 그 기기의 플레이어(닉네임). IP·브라우저 정보 등 다른 개인정보는 저장하지 않는다.
-- 게임 목록: score_cap(게임)이 있는 게임 = 통계를 받는 게임. 새 게임을 출시하며 score_cap을 늘리면 자동으로 포함된다.
--           붕어빵 눈싸움은 페이지 'bungeo-snowfight', 게임 키 'bungeo-easy|normal|hard'(컴퓨터 대전), 'bungeo-2p'(2인).
-- 로컬 Postgres에서 시험할 때: anon·authenticated 역할, extensions 스키마의 pgcrypto가 있어야 한다.

create extension if not exists pgcrypto;

-- 1. 표 ---------------------------------------------------------------
create table if not exists public.events (
  id        bigserial   primary key,
  at        timestamptz not null default now(),
  kind      text        not null,
  page      text        not null,          -- 'home' 또는 게임 페이지 slug
  game      text,                          -- play만: 게임 키 (붕어빵은 난이도별)
  device_id uuid        not null,
  player_id uuid,                          -- 기록 시점에 이 기기에 연결된 플레이어 (없으면 null = 닉네임 없음)
  eligible  boolean,                       -- play만: 순위에 올라갈 수 있는 판이었는지
  constraint events_kind_ok check (kind in ('visit', 'play')),
  constraint events_page_ok check (char_length(page) between 1 and 40),
  constraint events_game_ok check (game is null or char_length(game) between 1 and 40)
);
create index if not exists events_at_idx          on public.events (at);
create index if not exists events_device_idx      on public.events (device_id, at desc);
create index if not exists events_kind_page_idx   on public.events (kind, page, at);
create index if not exists events_player_idx      on public.events (player_id) where player_id is not null;

create table if not exists public.admin_auth (
  id           integer     primary key default 1,
  pw_hash      text,
  fails        integer     not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now(),
  constraint admin_auth_one check (id = 1)
);

alter table public.events     enable row level security;
alter table public.admin_auth enable row level security;
revoke all on public.events     from public, anon, authenticated;
revoke all on public.admin_auth from public, anon, authenticated;
revoke all on sequence public.events_id_seq from public, anon, authenticated;

-- 2. 페이지·게임 판정 (내부용) ------------------------------------------
-- 게임 키 → 페이지. 통계를 받지 않는 게임이면 null.
create or replace function public.analytics_page_of(p_game text)
returns text language sql immutable set search_path = public as $$
  select case
    when p_game = 'bungeo-2p' then 'bungeo-snowfight'
    when p_game like 'bungeo-%' and public.score_cap(p_game) is not null then 'bungeo-snowfight'
    when public.score_cap(p_game) is not null then p_game
    else null end;
$$;

create or replace function public.analytics_page_ok(p_page text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(p_page = 'home'
    or p_page = 'bungeo-snowfight'
    or (p_page not like 'bungeo-%' and public.score_cap(p_page) is not null), false);
$$;

-- 3. 기록 (누구나 호출, 표에는 이 함수로만 씀) -----------------------------
-- 같은 기기·같은 종류·같은 페이지/게임이 최근(visit 30분, play 20초) 안에 있으면 무시.
-- 기기당 하루(서울 날짜) 500건까지. 잘못된 값이면 raise(400).
create or replace function public.log_event(p_device uuid, p_kind text, p_page text, p_game text default null, p_eligible boolean default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_game   text := nullif(btrim(coalesce(p_game, '')), '');
  v_page   text := btrim(coalesce(p_page, ''));
  v_window interval;
  v_day0   timestamptz := (date_trunc('day', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul';
begin
  if p_device is null then
    raise exception 'missing value';
  end if;
  if p_kind = 'visit' then
    if not public.analytics_page_ok(v_page) then raise exception 'bad page'; end if;
    v_game := null;
    v_window := interval '30 minutes';
  elsif p_kind = 'play' then
    if v_game is null or public.analytics_page_of(v_game) is null then raise exception 'bad game'; end if;
    if v_page = '' then v_page := public.analytics_page_of(v_game); end if;
    if v_page <> public.analytics_page_of(v_game) then raise exception 'bad page'; end if;
    v_window := interval '20 seconds';
  else
    raise exception 'bad kind';
  end if;

  -- 같은 기기의 동시 호출은 차례로 (중복 판정이 겹치지 않게)
  perform pg_advisory_xact_lock(hashtext('studio-ev:' || p_device::text));

  if exists (select 1 from public.events e
              where e.device_id = p_device and e.kind = p_kind and e.page = v_page
                and e.game is not distinct from v_game and e.at > now() - v_window) then
    return;
  end if;
  if (select count(*) from public.events e where e.device_id = p_device and e.at >= v_day0) >= 500 then
    return;
  end if;

  insert into public.events (kind, page, game, device_id, player_id, eligible)
  values (p_kind, v_page, v_game, p_device,
          (select d.player_id from public.devices d where d.device_id = p_device),
          case when p_kind = 'play' then p_eligible else null end);
end;
$$;

-- 4. 관리자 비밀번호 정하기 (SQL Editor 전용, 앱에서는 호출 불가) -----------
create or replace function public.admin_set_password(p_new text)
returns text
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if p_new is null or char_length(p_new) < 8 then
    raise exception '비밀번호는 8자 이상이어야 해요';
  end if;
  insert into public.admin_auth (id, pw_hash, fails, locked_until, updated_at)
  values (1, crypt(p_new, gen_salt('bf', 10)), 0, null, now())
  on conflict (id) do update
    set pw_hash = excluded.pw_hash, fails = 0, locked_until = null, updated_at = now();
  return '관리자 비밀번호를 정했어요';
end;
$$;

-- 5. 통계 계산 (내부용, 비밀번호 확인 뒤에만 불림) ---------------------------
create or replace function public.analytics_report(p_days integer)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_days  integer := least(greatest(coalesce(p_days, 14), 1), 90);
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_t0    timestamptz := v_today::timestamp at time zone 'Asia/Seoul';           -- 오늘 0시(서울)
  v_t7    timestamptz := (v_today - 6)::timestamp at time zone 'Asia/Seoul';     -- 최근 7일(오늘 포함)
  v_t30   timestamptz := (v_today - 29)::timestamp at time zone 'Asia/Seoul';    -- 최근 30일(오늘 포함)
  v_res   jsonb;
begin
  select jsonb_build_object(
    'status', 'ok',
    'generated_at', now(),
    'today', v_today,
    'days', v_days,
    'visitors', (
      select jsonb_build_object(
        'today', count(distinct e.device_id) filter (where e.at >= v_t0),
        'd7',    count(distinct e.device_id) filter (where e.at >= v_t7),
        'd30',   count(distinct e.device_id) filter (where e.at >= v_t30),
        'all',   count(distinct e.device_id),
        'views_today', count(*) filter (where e.kind = 'visit' and e.at >= v_t0),
        'views_d7',    count(*) filter (where e.kind = 'visit' and e.at >= v_t7),
        'views_d30',   count(*) filter (where e.kind = 'visit' and e.at >= v_t30),
        'views_all',   count(*) filter (where e.kind = 'visit'),
        'plays_all',   count(*) filter (where e.kind = 'play'),
        'since',       min(e.at))
      from public.events e),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('date', d.day, 'visitors', coalesce(x.visitors, 0),
                                                   'views', coalesce(x.views, 0), 'plays', coalesce(x.plays, 0))
                                order by d.day), '[]'::jsonb)
      from (select v_today - i as day from generate_series(0, v_days - 1) as s(i)) d
      left join (
        select (e.at at time zone 'Asia/Seoul')::date as day,
               count(distinct e.device_id) as visitors,
               count(*) filter (where e.kind = 'visit') as views,
               count(*) filter (where e.kind = 'play') as plays
        from public.events e
        where e.at >= (v_today - (v_days - 1))::timestamp at time zone 'Asia/Seoul'
        group by 1
      ) x on x.day = d.day),
    'pages', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'page', p.page,
               'visitors', p.visitors, 'visitors_d7', p.visitors_d7, 'views', p.views,
               'plays', p.plays, 'plays_d7', p.plays_d7,
               'players', p.players, 'anon_plays', p.anon_plays, 'anon_devices', p.anon_devices,
               'last_play', p.last_play,
               'modes', (
                 select coalesce(jsonb_agg(jsonb_build_object('game', m.game, 'plays', m.plays, 'plays_d7', m.plays_d7) order by m.plays desc, m.game), '[]'::jsonb)
                 from (select e.game, count(*) as plays, count(*) filter (where e.at >= v_t7) as plays_d7
                       from public.events e where e.kind = 'play' and e.page = p.page group by e.game) m))
             order by p.plays desc, p.visitors desc, p.page), '[]'::jsonb)
      from (
        select e.page,
               count(distinct e.device_id) filter (where e.kind = 'visit') as visitors,
               count(distinct e.device_id) filter (where e.kind = 'visit' and e.at >= v_t7) as visitors_d7,
               count(*) filter (where e.kind = 'visit') as views,
               count(*) filter (where e.kind = 'play') as plays,
               count(*) filter (where e.kind = 'play' and e.at >= v_t7) as plays_d7,
               count(distinct e.player_id) filter (where e.kind = 'play') as players,
               count(*) filter (where e.kind = 'play' and e.player_id is null) as anon_plays,
               count(distinct e.device_id) filter (where e.kind = 'play' and e.player_id is null) as anon_devices,
               max(e.at) filter (where e.kind = 'play') as last_play
        from public.events e
        where e.page <> 'home'
        group by e.page
      ) p),
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'nickname', coalesce(pl.nickname, '(지워진 플레이어)'),
               'total', t.total, 'd7', t.d7, 'last_at', t.last_at, 'games', t.games)
             order by t.total desc, t.last_at desc), '[]'::jsonb)
      from (
        select x.player_id, sum(x.n) as total, sum(x.n7) as d7, max(x.last_at) as last_at,
               jsonb_object_agg(x.page, x.n) as games
        from (
          select e.player_id, e.page, count(*) as n, count(*) filter (where e.at >= v_t7) as n7, max(e.at) as last_at
          from public.events e
          where e.kind = 'play' and e.player_id is not null
          group by e.player_id, e.page
        ) x
        group by x.player_id
        order by sum(x.n) desc, max(x.last_at) desc
        limit 50
      ) t
      left join public.players pl on pl.player_id = t.player_id),
    'totals', jsonb_build_object(
      'players',          (select count(*) from public.players),
      'players_with_pin', (select count(*) from public.players p where p.pin_hash is not null),
      'score_rows',       (select count(*) from public.player_scores),
      'active_players',   (select count(distinct e.player_id) from public.events e where e.kind = 'play' and e.player_id is not null),
      'events',           (select count(*) from public.events))
  ) into v_res;
  return v_res;
end;
$$;

-- 6. 관리자 통계 (누구나 호출 가능하지만 비밀번호가 맞아야 내용이 나옴) ---------
-- 결과 jsonb.status: ok(통계 포함) | wrong(tries_left) | locked(seconds_left) | no_password(아직 비밀번호를 안 정함)
-- 틀린 비밀번호는 raise하지 않고 결과로 돌려준다(실패 횟수 기록이 롤백되지 않도록). 5번 틀리면 15분 잠금.
create or replace function public.admin_stats(p_pass text, p_days integer default 14)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  a public.admin_auth%rowtype;
begin
  select * into a from public.admin_auth where id = 1 for update;
  if not found or a.pw_hash is null then
    return jsonb_build_object('status', 'no_password');
  end if;
  if a.locked_until is not null and a.locked_until > now() then
    return jsonb_build_object('status', 'locked', 'seconds_left', ceil(extract(epoch from a.locked_until - now()))::integer);
  end if;
  if p_pass is null or char_length(p_pass) > 200 or a.pw_hash <> crypt(p_pass, a.pw_hash) then
    if a.fails + 1 >= 5 then
      update public.admin_auth set fails = 0, locked_until = now() + interval '15 minutes' where id = 1;
      return jsonb_build_object('status', 'locked', 'seconds_left', 900);
    end if;
    update public.admin_auth set fails = a.fails + 1, locked_until = null where id = 1;
    return jsonb_build_object('status', 'wrong', 'tries_left', 5 - (a.fails + 1));
  end if;
  if a.fails <> 0 or a.locked_until is not null then
    update public.admin_auth set fails = 0, locked_until = null where id = 1;
  end if;
  return public.analytics_report(p_days);
end;
$$;

-- 7. 권한 -------------------------------------------------------------
-- Supabase는 public 스키마의 새 함수에 anon·authenticated 실행 권한을 자동으로 주므로 명시적으로 거둔다.
revoke all on function public.analytics_page_of(text)                         from public, anon, authenticated;
revoke all on function public.analytics_page_ok(text)                         from public, anon, authenticated;
revoke all on function public.analytics_report(integer)                       from public, anon, authenticated;
revoke all on function public.admin_set_password(text)                        from public, anon, authenticated;
revoke all on function public.log_event(uuid, text, text, text, boolean)      from public;
revoke all on function public.admin_stats(text, integer)                      from public;
grant execute on function public.log_event(uuid, text, text, text, boolean)   to anon, authenticated;
grant execute on function public.admin_stats(text, integer)                   to anon, authenticated;
