-- 꼬마 사장님(tiny-company) 순위 추가: score_cap 재정의 (한 번 Run)
-- 점수 = 1년(12개월) 완주 시 연 매출 합계(만원). 이론상 최대 약 43,000 → 상한 50,000.
-- 기존 값은 그대로 유지(fake-evidence는 사이트에서 내렸지만 SQL에는 남겨 둠).
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
    else null end;
$$;
revoke all on function public.score_cap(text) from public, anon, authenticated;
