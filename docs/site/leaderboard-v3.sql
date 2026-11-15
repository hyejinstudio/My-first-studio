-- 순위표 v3: 닉네임 계정(유일 닉네임 + 숫자 4자리 PIN) + 기록은 닉네임(플레이어) 단위 + 붕어빵 눈싸움 난이도별 순위
-- v1(leaderboard.sql 앞부분) + v2(score_cap, submit_score 검사) 위에 한 번 더 Run. 여러 번 Run해도 안전.
-- 로컬 Postgres에서 시험할 때: anon·authenticated 역할이 없으면 먼저
--   create role anon nologin; create role authenticated nologin;
-- (Supabase에는 이미 있으므로 여기서는 만들지 않는다)

-- 0. PIN 해시용 (Supabase는 이미 extensions 스키마에 설치되어 있어 아무 일도 안 함)
create extension if not exists pgcrypto;

-- 1. 표 ---------------------------------------------------------------
create table if not exists public.players (
  player_id    uuid        primary key default gen_random_uuid(),
  nickname     text        not null,
  nick_key     text        not null,                 -- 소문자, 공백·_·-·. 제거 (유일 판정용)
  pin_hash     text,                                  -- crypt(pin, gen_salt('bf')). null = 옛 기록에서 옮겨 와 아직 PIN을 안 정함
  pin_fails    integer     not null default 0,
  locked_until timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint players_nick_ok check (char_length(nickname) between 1 and 8),
  constraint players_key_ok  check (char_length(nick_key) between 1 and 8)
);
create unique index if not exists players_nick_key_uq on public.players (nick_key);

create table if not exists public.devices (
  device_id uuid        primary key,
  player_id uuid        not null references public.players (player_id) on delete cascade,
  linked_at timestamptz not null default now()
);
create index if not exists devices_player_idx on public.devices (player_id);

create table if not exists public.player_scores (
  game       text        not null,
  player_id  uuid        not null references public.players (player_id) on delete cascade,
  score      integer     not null,
  updated_at timestamptz not null default now(),   -- 지금 점수를 세운 시각 (같은 점수면 먼저 세운 사람이 위)
  primary key (game, player_id),
  constraint player_scores_score_ok check (score between 1 and 10000000)
);
create index if not exists player_scores_rank_idx on public.player_scores (game, score desc, updated_at asc, player_id);

alter table public.players       enable row level security;
alter table public.devices       enable row level security;
alter table public.player_scores enable row level security;
revoke all on public.players       from public, anon, authenticated;
revoke all on public.devices       from public, anon, authenticated;
revoke all on public.player_scores from public, anon, authenticated;

-- 2. 게임별 상한 (붕어빵 3개 추가: 이긴 판의 내 땅 %를 0.1% 단위 정수로, 100.0% = 1000)
create or replace function public.score_cap(p_game text)
returns integer language sql immutable set search_path = public as $$
  select case p_game
    when 'poop-rain'     then 50000
    when 'mole-pop'      then 10000
    when 'bunny-ten'     then 170
    when 'snake-garden'  then 4000
    when 'block-stack'   then 5000000
    when 'parrot-beat'   then 60000
    when 'bungeo-easy'   then 1000
    when 'bungeo-normal' then 1000
    when 'bungeo-hard'   then 1000
    else null end;
$$;

-- 3. 닉네임 도우미 (내부용) -------------------------------------------
create or replace function public.lb_nick_clean(p text)
returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
$$;

create or replace function public.lb_nick_key(p text)
returns text language sql immutable set search_path = public as $$
  select lower(regexp_replace(coalesce(p, ''), '[[:space:]_.-]', '', 'g'));
$$;

create or replace function public.lb_nick_ok(p text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(
        char_length(p) between 1 and 8
    and p !~ '[[:cntrl:]@]'
    and p !~ '([0-9].*){5,}'
    and p ~ '^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9 _.-]+$'
    and public.lb_nick_key(p) <> '', false);
$$;

-- 4. 기존 기록 옮기기 (한 번만 실제로 동작, 다시 Run하면 건너뜀) ------------
-- 기기마다 가장 최근 닉네임을 그 기기의 이름으로 본다.
-- 같은 닉네임(nick_key)을 여러 기기가 썼으면 가장 먼저 기록을 남긴 기기 1대만 그 이름을 갖는다.
-- 나머지 기기의 옛 기록은 표에 남아 있다가, 그 기기가 새 닉네임으로 등록할 때 함께 옮겨진다(claim_nickname).
-- 옮겨진 플레이어는 PIN이 없다(pin_hash null). 그 기기에서 처음 닉네임 창을 통과할 때 PIN을 정한다.
do $$
declare
  r     record;
  v_pid uuid;
begin
  for r in
    select distinct on (c.k) c.device_id, c.nick, c.k
    from (
      select dv.device_id, dv.nick, public.lb_nick_key(dv.nick) as k,
             (select min(s2.updated_at) from public.scores s2 where s2.device_id = dv.device_id) as first_at
      from (
        select distinct on (s.device_id) s.device_id, public.lb_nick_clean(s.nickname) as nick
        from public.scores s
        order by s.device_id, s.updated_at desc
      ) dv
    ) c
    where public.lb_nick_ok(c.nick)
    order by c.k, c.first_at, c.device_id
  loop
    if exists (select 1 from public.devices d where d.device_id = r.device_id)
       or exists (select 1 from public.players p where p.nick_key = r.k) then
      continue;
    end if;
    insert into public.players (nickname, nick_key) values (r.nick, r.k)
      returning player_id into v_pid;
    insert into public.devices (device_id, player_id) values (r.device_id, v_pid);
    insert into public.player_scores (game, player_id, score, updated_at)
      select s.game, v_pid, s.score, s.updated_at
      from public.scores s
      where s.device_id = r.device_id
        and s.score between 1 and coalesce(public.score_cap(s.game), 0)
    on conflict (game, player_id) do nothing;
  end loop;
end $$;

-- 5. 닉네임 등록 / 이어받기 -------------------------------------------
-- status: created(새로 만듦) | same(이 기기의 내 닉네임, 옛 기록 기기는 이때 PIN을 정함)
--       | linked(다른 기기의 닉네임을 PIN으로 이어받음) | taken(다른 사람이 씀) | wrong_pin | locked
-- 형식이 틀리면 raise → HTTP 400. 틀린 PIN은 raise하지 않고 행으로 돌려준다(실패 횟수 기록이 롤백되지 않도록).
create or replace function public.claim_nickname(p_device uuid, p_nick text, p_pin text)
returns table(status text, nickname text, tries_left integer)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_column
declare
  v_nick text := public.lb_nick_clean(p_nick);
  v_key  text := public.lb_nick_key(public.lb_nick_clean(p_nick));
  v_pin  text := coalesce(p_pin, '');
  v_me   uuid;
  v_new  boolean;
  v_pid  uuid;
  pl     public.players%rowtype;
begin
  if p_device is null then
    raise exception 'missing value';
  end if;
  if not public.lb_nick_ok(v_nick) then
    raise exception 'bad nickname';
  end if;
  if v_pin !~ '^[0-9]{4}$' then
    raise exception 'bad pin';
  end if;

  select d.player_id into v_me from public.devices d where d.device_id = p_device;
  v_new := v_me is null;

  select * into pl from public.players p where p.nick_key = v_key for update;

  -- (가) 아무도 안 쓰는 이름
  if not found then
    begin
      -- 옛 기록에서 옮겨 온, 아직 PIN 없는 내 플레이어면 이름만 바꾸고 PIN을 정한다(기록 유지)
      if v_me is not null and exists (select 1 from public.players p where p.player_id = v_me and p.pin_hash is null) then
        update public.players p
           set nickname = v_nick, nick_key = v_key, pin_hash = crypt(v_pin, gen_salt('bf', 8)),
               pin_fails = 0, locked_until = null, updated_at = now()
         where p.player_id = v_me;
        return query select 'created'::text, v_nick, null::integer;
        return;
      end if;
      insert into public.players (nickname, nick_key, pin_hash)
        values (v_nick, v_key, crypt(v_pin, gen_salt('bf', 8)))
        returning player_id into v_pid;
      insert into public.devices (device_id, player_id) values (p_device, v_pid)
        on conflict (device_id) do update set player_id = excluded.player_id, linked_at = now();
    exception when unique_violation then
      return query select 'taken'::text, null::text, null::integer;
      return;
    end;
    -- 처음 등록하는 기기: 이 기기의 옛 기록(scores)을 새 플레이어로 옮긴다
    if v_new then
      insert into public.player_scores (game, player_id, score, updated_at)
        select s.game, v_pid, s.score, s.updated_at
        from public.scores s
        where s.device_id = p_device
          and s.score between 1 and coalesce(public.score_cap(s.game), 0)
      on conflict (game, player_id) do nothing;
    end if;
    return query select 'created'::text, v_nick, null::integer;
    return;
  end if;

  -- (나) 이미 있는 이름, PIN 없음(옛 기록에서 옮겨 온 이름)
  if pl.pin_hash is null then
    if pl.player_id = v_me then
      update public.players p
         set pin_hash = crypt(v_pin, gen_salt('bf', 8)), pin_fails = 0, locked_until = null, updated_at = now()
       where p.player_id = pl.player_id;
      return query select 'same'::text, pl.nickname, null::integer;
      return;
    end if;
    return query select 'taken'::text, null::text, null::integer;
    return;
  end if;

  -- (다) 이미 있는 이름, PIN 확인
  if pl.locked_until is not null and pl.locked_until > now() then
    return query select 'locked'::text, null::text, 0;
    return;
  end if;

  if pl.pin_hash = crypt(v_pin, pl.pin_hash) then
    update public.players p set pin_fails = 0, locked_until = null where p.player_id = pl.player_id;
    insert into public.devices (device_id, player_id) values (p_device, pl.player_id)
      on conflict (device_id) do update set player_id = excluded.player_id, linked_at = now();
    return query select (case when pl.player_id = v_me then 'same' else 'linked' end)::text, pl.nickname, null::integer;
    return;
  end if;

  -- 틀린 PIN: 5번 틀리면 15분 잠금
  if pl.pin_fails + 1 >= 5 then
    update public.players p
       set pin_fails = 0, locked_until = now() + interval '15 minutes'
     where p.player_id = pl.player_id;
    return query select 'locked'::text, null::text, 0;
    return;
  end if;
  update public.players p set pin_fails = pl.pin_fails + 1 where p.player_id = pl.player_id;
  return query select 'wrong_pin'::text, null::text, 5 - (pl.pin_fails + 1);
end;
$$;

-- 6. 이름 바꾸기 (기록·PIN 유지) ---------------------------------------
-- status: ok | taken. 이 기기가 등록 안 됐거나 PIN이 없으면 raise(400).
create or replace function public.rename_nickname(p_device uuid, p_nick text)
returns table(status text, nickname text)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_nick text := public.lb_nick_clean(p_nick);
  v_key  text := public.lb_nick_key(public.lb_nick_clean(p_nick));
  v_pid  uuid;
begin
  if p_device is null then
    raise exception 'missing value';
  end if;
  if not public.lb_nick_ok(v_nick) then
    raise exception 'bad nickname';
  end if;
  select d.player_id into v_pid
    from public.devices d join public.players p on p.player_id = d.player_id
   where d.device_id = p_device and p.pin_hash is not null;
  if v_pid is null then
    raise exception 'no player';
  end if;
  if exists (select 1 from public.players p where p.nick_key = v_key and p.player_id <> v_pid) then
    return query select 'taken'::text, null::text;
    return;
  end if;
  begin
    update public.players p set nickname = v_nick, nick_key = v_key, updated_at = now() where p.player_id = v_pid;
  exception when unique_violation then
    return query select 'taken'::text, null::text;
    return;
  end;
  return query select 'ok'::text, v_nick;
end;
$$;

-- 7. 이 기기의 닉네임 확인 (읽기 전용, 다른 기기에서 이름을 바꿨을 때 맞추기용) --
create or replace function public.whoami(p_device uuid)
returns table(nickname text, has_pin boolean)
language sql stable security definer set search_path = public as $$
  select p.nickname, p.pin_hash is not null
  from public.devices d join public.players p on p.player_id = d.player_id
  where d.device_id = p_device;
$$;

-- 8. 순위 함수 교체 (이름·인자·반환 형식 그대로, 플레이어 단위로 읽음) ------
create or replace function public.my_rank(p_game text, p_device uuid)
returns table(rank bigint, total bigint, best integer, nickname text)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.player_scores o
      where o.game = s.game
        and (o.score > s.score
             or (o.score = s.score
                 and (o.updated_at < s.updated_at
                      or (o.updated_at = s.updated_at and o.player_id < s.player_id))))) + 1,
    (select count(*) from public.player_scores t where t.game = s.game),
    s.score,
    p.nickname
  from public.devices d
  join public.player_scores s on s.player_id = d.player_id and s.game = p_game
  join public.players p on p.player_id = s.player_id
  where d.device_id = p_device;
$$;

create or replace function public.top_scores(p_game text, p_limit integer default 20, p_device uuid default null)
returns table(rank bigint, nickname text, score integer, is_me boolean)
language sql stable security definer set search_path = public as $$
  select
    row_number() over (order by s.score desc, s.updated_at asc, s.player_id asc),
    p.nickname,
    s.score,
    coalesce(s.player_id = (select d.player_id from public.devices d where d.device_id = p_device), false)
  from public.player_scores s
  join public.players p on p.player_id = s.player_id
  where s.game = p_game
  order by s.score desc, s.updated_at asc, s.player_id asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- 기록 등록: 기기 → 플레이어로 바꿔 플레이어의 최고 기록만 갱신. p_nick은 호환용(무시, 이름은 players에서).
create or replace function public.submit_score(p_game text, p_device uuid, p_nick text, p_score integer)
returns table(rank bigint, total bigint, best integer, nickname text)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_cap integer := public.score_cap(p_game);
  v_pid uuid;
begin
  if p_game is null or p_device is null or p_score is null then
    raise exception 'missing value';
  end if;
  if v_cap is null then
    raise exception 'bad game';
  end if;
  if p_score < 1 or p_score > v_cap then
    raise exception 'bad score';
  end if;
  select d.player_id into v_pid from public.devices d where d.device_id = p_device;
  if v_pid is null then
    raise exception 'no player';
  end if;

  insert into public.player_scores as s (game, player_id, score)
  values (p_game, v_pid, p_score)
  on conflict (game, player_id) do update
    set score      = greatest(s.score, excluded.score),
        updated_at = case when excluded.score > s.score then now() else s.updated_at end;

  return query select * from public.my_rank(p_game, p_device);
end;
$$;

-- 8-1. PIN 바꾸기 (이 기기에 연결된 플레이어만, 지금 PIN 확인 — 틀림·잠금 규칙은 claim_nickname과 같음)
create or replace function public.change_pin(p_device uuid, p_old text, p_new text)
returns table(status text, tries_left integer)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_column
declare
  pl public.players%rowtype;
begin
  if p_device is null or coalesce(p_new, '') !~ '^[0-9]{4}$' then
    raise exception 'bad pin';
  end if;
  select p.* into pl from public.players p
    join public.devices d on d.player_id = p.player_id
   where d.device_id = p_device
   for update of p;
  if not found then
    raise exception 'no player';
  end if;
  if pl.pin_hash is not null then
    if pl.locked_until is not null and pl.locked_until > now() then
      return query select 'locked'::text, 0;
      return;
    end if;
    if coalesce(p_old, '') !~ '^[0-9]{4}$' or pl.pin_hash <> crypt(p_old, pl.pin_hash) then
      if pl.pin_fails + 1 >= 5 then
        update public.players p set pin_fails = 0, locked_until = now() + interval '15 minutes'
         where p.player_id = pl.player_id;
        return query select 'locked'::text, 0;
        return;
      end if;
      update public.players p set pin_fails = pl.pin_fails + 1 where p.player_id = pl.player_id;
      return query select 'wrong_pin'::text, 5 - (pl.pin_fails + 1);
      return;
    end if;
  end if;
  update public.players p
     set pin_hash = crypt(p_new, gen_salt('bf', 8)), pin_fails = 0, locked_until = null, updated_at = now()
   where p.player_id = pl.player_id;
  return query select 'ok'::text, null::integer;
end;
$$;

-- 9. 권한 -------------------------------------------------------------
revoke all on function public.score_cap(text)     from public, anon, authenticated;
revoke all on function public.lb_nick_clean(text) from public, anon, authenticated;
revoke all on function public.lb_nick_key(text)   from public, anon, authenticated;
revoke all on function public.lb_nick_ok(text)    from public, anon, authenticated;

revoke all on function public.claim_nickname(uuid, text, text)           from public;
revoke all on function public.rename_nickname(uuid, text)                from public;
revoke all on function public.whoami(uuid)                               from public;
revoke all on function public.change_pin(uuid, text, text)               from public;
revoke all on function public.my_rank(text, uuid)                        from public;
revoke all on function public.top_scores(text, integer, uuid)            from public;
revoke all on function public.submit_score(text, uuid, text, integer)    from public;
grant execute on function public.claim_nickname(uuid, text, text)        to anon, authenticated;
grant execute on function public.rename_nickname(uuid, text)             to anon, authenticated;
grant execute on function public.whoami(uuid)                            to anon, authenticated;
grant execute on function public.change_pin(uuid, text, text)            to anon, authenticated;
grant execute on function public.my_rank(text, uuid)                     to anon, authenticated;
grant execute on function public.top_scores(text, integer, uuid)         to anon, authenticated;
grant execute on function public.submit_score(text, uuid, text, integer) to anon, authenticated;
