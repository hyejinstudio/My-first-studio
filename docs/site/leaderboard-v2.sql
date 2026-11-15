-- 순위표 v2: 게임별 점수 상한 + 닉네임 기본 검사 (한 번 더 Run)
create or replace function public.score_cap(p_game text)
returns integer language sql immutable set search_path = public as $$
  select case p_game
    when 'poop-rain'    then 50000
    when 'mole-pop'     then 10000
    when 'bunny-ten'    then 170
    when 'snake-garden' then 4000
    when 'block-stack'  then 5000000
    when 'parrot-beat'  then 60000
    else null end;
$$;

create or replace function public.submit_score(p_game text, p_device uuid, p_nick text, p_score integer)
returns table(rank bigint, total bigint, best integer, nickname text)
language plpgsql security definer set search_path = public as $$
declare
  v_nick text := regexp_replace(btrim(coalesce(p_nick, '')), '\s+', ' ', 'g');
  v_cap  integer := public.score_cap(p_game);
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
  if char_length(v_nick) < 1 or char_length(v_nick) > 8
     or v_nick ~ '[[:cntrl:]@]'
     or v_nick ~ '([0-9].*){5,}' then
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

revoke all on function public.score_cap(text) from public, anon, authenticated;
grant execute on function public.submit_score(text, uuid, text, integer) to anon, authenticated;
