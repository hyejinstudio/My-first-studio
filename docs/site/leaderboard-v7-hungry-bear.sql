-- 폭식 불곰을 찾아라(hungry-bear) 순위 추가: score_cap 재정의 (Supabase SQL Editor에 통째로 붙여넣고 한 번 Run)
-- v1 ~ v6 위에 Run. 여러 번 Run해도 안전(함수만 바꾸고 기록은 건드리지 않음).
-- score_cap은 v5(tiny-company)에서 마지막으로 정의됐다. v6(통계)는 score_cap을 읽기만 하므로
-- 여기서 hungry-bear를 넣으면 순위 제출과 방문·플레이 통계(log_event)가 함께 열린다.
-- 점수 = 클리어한 레벨 수(정수). 레벨 상한은 없지만 16레벨 이후는 사람 한계 근처(기획서 제안 100) → 넉넉히 200.
-- 기존 값은 그대로 유지(fake-evidence·tiny-company는 사이트 목록에 없지만 SQL에는 남겨 둠).
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
    when 'tiny-company'  then 50000
    when 'hungry-bear'   then 200
    else null end;
$$;
revoke all on function public.score_cap(text) from public, anon, authenticated;
