-- 증거 조작범(fake-evidence) 순위 추가: score_cap 재정의 (한 번 Run)
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
    when 'fake-evidence' then 2000
    else null end;
$$;
revoke all on function public.score_cap(text) from public, anon, authenticated;
