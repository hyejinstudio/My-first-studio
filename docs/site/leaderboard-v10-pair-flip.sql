-- 짝꿍 카드(pair-flip) 순위 추가: score_cap 재정의 (Supabase SQL Editor에 통째로 붙여넣고 한 번 Run)
-- v1 ~ v9 위에 Run. 여러 번 Run해도 안전(함수만 바꾸고 기록은 건드리지 않음).
-- score_cap은 v9(bunny-ten 1370)에서 마지막으로 정의됐다. 여기서 pair-flip을 넣으면 순위 제출과 방문·플레이 통계(log_event)가 함께 열린다.
-- 점수 = 60000 − 걸린 시간(센티초). 빠를수록 높은 점수라 기존 내림차순 순위 그대로 쓴다(화면에는 시간으로 표시).
-- 상한 59500 = 5.00초보다 빠른 기록은 거부. 다른 값은 v9 그대로.
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
    when 'pair-flip'     then 59500
    else null end;
$$;
revoke all on function public.score_cap(text) from public, anon, authenticated;
