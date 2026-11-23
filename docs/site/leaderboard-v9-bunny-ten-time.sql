-- 개구리 텐(bunny-ten) 만점자 시간 순위: score_cap 재정의 (Supabase SQL Editor에 통째로 붙여넣고 한 번 Run)
-- 점수 = 169 이하는 마리 수, 만점(170)은 170 + 남은 시간(0.1초 단위, 최대 1200) → 상한 1370. 다른 값은 v7 그대로.
-- 여러 번 Run해도 안전(함수만 바꾸고 기록은 건드리지 않음). 기존 170점 기록은 '만점, 남은 시간 0초'로 취급된다.
create or replace function public.score_cap(p_game text)
returns integer language sql immutable set search_path = public as $$
  select case p_game
    when 'poop-rain'     then 50000
    when 'mole-pop'      then 10000
    when 'bunny-ten'     then 1370
    when 'snake-garden'  then 4000
    when 'block-stack'   then 5000000
    when 'parrot-beat'   then 60000
    when 'bungeo-easy'   then 1000
    when 'bungeo-normal' then 1000
    when 'bungeo-hard'   then 1000
    when 'fake-evidence' then 2000
    when 'tiny-company'  then 50000
    when 'hungry-bear'   then 200
    else null end;
$$;
revoke all on function public.score_cap(text) from public, anon, authenticated;
