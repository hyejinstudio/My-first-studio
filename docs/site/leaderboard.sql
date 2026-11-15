-- 혜진's 스튜디오 순위표 (Supabase SQL Editor에 통째로 붙여넣고 Run)
-- 기기마다 게임별 최고 점수 1줄만 저장한다. 표에 직접 접근은 막고, 아래 함수 3개로만 읽고 쓴다.

create table if not exists public.scores (
  game       text        not null,
  device_id  uuid        not null,
  nickname   text        not null,
  score      integer     not null,
  updated_at timestamptz not null default now(),
  primary key (game, device_id),
  constraint scores_game_ok  check (game in ('poop-rain','mole-pop','bunny-ten','snake-garden','block-stack','parrot-beat')),
  constraint scores_nick_ok  check (char_length(nickname) between 1 and 8),
  constraint scores_score_ok check (score between 0 and 10000000)
);

create index if not exists scores_rank_idx on public.scores (game, score desc, updated_at asc);

alter table public.scores enable row level security;
revoke all on public.scores from anon, authenticated;

-- 내 순위: 같은 점수면 먼저 세운 사람이 위
create or replace function public.my_rank(p_game text, p_device uuid)
returns table(rank bigint, total bigint, best integer, nickname text)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from scores o
      where o.game = s.game
        and (o.score > s.score or (o.score = s.score and o.updated_at < s.updated_at))) + 1,
    (select count(*) from scores t where t.game = s.game),
    s.score,
    s.nickname
  from scores s
  where s.game = p_game and s.device_id = p_device;
$$;

-- 상위 순위표 (최대 50명). p_device를 주면 내 줄에 is_me = true
create or replace function public.top_scores(p_game text, p_limit integer default 20, p_device uuid default null)
returns table(rank bigint, nickname text, score integer, is_me boolean)
language sql stable security definer set search_path = public as $$
  select
    row_number() over (order by s.score desc, s.updated_at asc),
    s.nickname,
    s.score,
    (p_device is not null and s.device_id = p_device)
  from scores s
  where s.game = p_game
  order by s.score desc, s.updated_at asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- 기록 등록: 더 높은 점수일 때만 점수 갱신, 닉네임은 항상 최신으로
create or replace function public.submit_score(p_game text, p_device uuid, p_nick text, p_score integer)
returns table(rank bigint, total bigint, best integer, nickname text)
language plpgsql security definer set search_path = public as $$
declare
  v_nick text := btrim(coalesce(p_nick, ''));
begin
  if p_game is null or p_device is null or p_score is null then
    raise exception 'missing value';
  end if;
  if char_length(v_nick) < 1 or char_length(v_nick) > 8 then
    raise exception 'bad nickname';
  end if;

  insert into scores as s (game, device_id, nickname, score)
  values (p_game, p_device, v_nick, p_score)
  on conflict (game, device_id) do update
    set nickname   = excluded.nickname,
        score      = greatest(s.score, excluded.score),
        updated_at = case when excluded.score > s.score then now() else s.updated_at end;

  return query select * from public.my_rank(p_game, p_device);
end;
$$;

revoke all on function public.my_rank(text, uuid) from public;
revoke all on function public.top_scores(text, integer, uuid) from public;
revoke all on function public.submit_score(text, uuid, text, integer) from public;
grant execute on function public.my_rank(text, uuid) to anon, authenticated;
grant execute on function public.top_scores(text, integer, uuid) to anon, authenticated;
grant execute on function public.submit_score(text, uuid, text, integer) to anon, authenticated;
