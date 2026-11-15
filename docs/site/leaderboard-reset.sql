-- 순위표 기록 전부 지우기 (2026-11-15 사용자 요청: "지금까지 기록된게 있으면 그냥 삭제해줘")
-- 표·함수는 그대로 두고 기록만 비운다. v3 표가 아직 없어도 오류 없이 동작한다.
do $$
begin
  if to_regclass('public.player_scores') is not null then
    execute 'truncate table public.player_scores, public.devices, public.players';
  end if;
  truncate table public.scores;
end
$$;
