-- 순위표 v8: 사이트 피드백 칸 + 관리자 전용 열람 (Supabase SQL Editor에 통째로 붙여넣고 Run)
-- v1 ~ v7(hungry-bear) 위에 Run. 여러 번 Run해도 안전(받은 피드백·통계·관리자 비밀번호는 지워지지 않음).
-- (파일 이름: v7은 이미 leaderboard-v7-hungry-bear.sql이 있어서 v8로 붙였다)
--
-- 모으는 것: 피드백 내용, 보낸 페이지('home' 또는 게임 페이지), 무작위 기기 번호, 그때의 플레이어와 닉네임(스냅샷).
--           IP·브라우저 정보 등 다른 개인정보는 저장하지 않는다. 내용은 관리자 비밀번호로만 볼 수 있다.
-- 남용 방지: 기기당 30초에 1건·서울 하루 10건, 사이트 전체 1분 30건·서울 하루 300건.
--           넘으면 raise하지 않고 {"status":"too_fast"|"limit"}로 돌려준다.
-- 관리자 비밀번호 확인(admin_verify)은 admin_stats와 같은 규칙·같은 잠금 카운터(admin_auth)를 쓴다.
--   → 통계와 피드백 어느 쪽에서 틀려도 합쳐서 5번이면 15분 잠금. admin_stats의 동작·반환 형식은 v6과 같다.
-- 로컬 Postgres에서 시험할 때: anon·authenticated 역할, extensions 스키마의 pgcrypto가 있어야 한다.

create extension if not exists pgcrypto;

-- 1. 표 ---------------------------------------------------------------
create table if not exists public.feedback (
  id        bigserial   primary key,
  at        timestamptz not null default now(),
  device_id uuid        not null,
  player_id uuid,                          -- 보낸 시점에 이 기기에 연결된 플레이어 (없으면 null)
  nickname  text,                          -- 보낸 시점의 닉네임 스냅샷 (없으면 null = 닉네임 없음)
  page      text        not null,          -- 'home' 또는 게임 페이지 slug
  message   text        not null,
  read      boolean     not null default false,
  constraint feedback_page_ok    check (char_length(page) between 1 and 40),
  constraint feedback_message_ok check (char_length(message) between 2 and 500)
);
create index if not exists feedback_at_idx     on public.feedback (at desc);
create index if not exists feedback_device_idx on public.feedback (device_id, at desc);
create index if not exists feedback_unread_idx on public.feedback (id) where not read;

alter table public.feedback enable row level security;
revoke all on public.feedback from public, anon, authenticated;
revoke all on sequence public.feedback_id_seq from public, anon, authenticated;

-- 2. 피드백 보내기 (누구나 호출, 표에는 이 함수로만 씀) ---------------------
-- 결과 jsonb.status: ok | too_fast(seconds_left) | limit | bad_message(너무 짧거나 김) | bad(기기 번호·페이지가 잘못됨)
create or replace function public.submit_feedback(p_device uuid, p_message text, p_page text default 'home')
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_msg  text := coalesce(p_message, '');
  v_page text := btrim(coalesce(p_page, ''));
  v_day0 timestamptz := (date_trunc('day', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul';
  v_last timestamptz;
  v_pid  uuid;
  v_nick text;
begin
  if p_device is null then
    return jsonb_build_object('status', 'bad');
  end if;
  if v_page = '' then v_page := 'home'; end if;
  if not public.analytics_page_ok(v_page) then
    return jsonb_build_object('status', 'bad');
  end if;
  if char_length(v_msg) > 4000 then              -- 정리 전에 너무 큰 입력은 바로 거절
    return jsonb_build_object('status', 'bad_message');
  end if;

  -- 정리: 줄바꿈 통일 → 탭은 공백 → 다른 제어문자·보이지 않는 방향 제어 문자 제거 → 줄 끝 공백 제거
  --       → 빈 줄 3개 이상은 2개로 → 앞뒤 공백·줄바꿈 제거
  v_msg := replace(replace(v_msg, E'\r\n', E'\n'), E'\r', E'\n');
  v_msg := replace(v_msg, E'\t', ' ');
  v_msg := regexp_replace(v_msg, E'[\\x01-\\x09\\x0b-\\x1f\\x7f-\\x9f\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u2069\\ufeff]', '', 'g');
  v_msg := regexp_replace(v_msg, E'[ ]+\n', E'\n', 'g');
  v_msg := regexp_replace(v_msg, E'\n{3,}', E'\n\n', 'g');
  v_msg := regexp_replace(v_msg, E'^[\\s]+|[\\s]+$', '', 'g');
  if char_length(v_msg) < 2 or char_length(v_msg) > 500 then
    return jsonb_build_object('status', 'bad_message');
  end if;

  -- 피드백은 드물므로 전체를 차례로 처리(기기·전체 상한 판정이 겹치지 않게)
  perform pg_advisory_xact_lock(hashtext('studio-fb'));

  select max(f.at) into v_last from public.feedback f where f.device_id = p_device;
  if v_last is not null and v_last > now() - interval '30 seconds' then
    return jsonb_build_object('status', 'too_fast',
      'seconds_left', greatest(1, ceil(extract(epoch from v_last + interval '30 seconds' - now())))::integer);
  end if;
  if (select count(*) from public.feedback f where f.device_id = p_device and f.at >= v_day0) >= 10 then
    return jsonb_build_object('status', 'limit');
  end if;
  -- 전체 상한(기기 번호를 매번 바꾸는 대량 위조 방지)
  if (select count(*) from public.feedback f where f.at > now() - interval '1 minute') >= 30 then
    return jsonb_build_object('status', 'too_fast', 'seconds_left', 60);
  end if;
  if (select count(*) from public.feedback f where f.at >= v_day0) >= 300 then
    return jsonb_build_object('status', 'limit');
  end if;

  select d.player_id, p.nickname into v_pid, v_nick
    from public.devices d left join public.players p on p.player_id = d.player_id
   where d.device_id = p_device;

  insert into public.feedback (device_id, player_id, nickname, page, message)
  values (p_device, v_pid, v_nick, v_page, v_msg);
  return jsonb_build_object('status', 'ok');
end;
$$;

-- 3. 관리자 비밀번호 확인 (내부용, 앱에서는 호출 불가) ------------------------
-- 결과 jsonb.status: ok | wrong(tries_left) | locked(seconds_left) | no_password
-- v6 admin_stats의 규칙 그대로: 5번 틀리면 15분 잠금, 맞으면 실패 횟수 초기화.
-- 부르는 함수는 이 결과를 raise하지 말고 그대로 돌려줘야 실패 횟수가 롤백되지 않는다.
create or replace function public.admin_verify(p_pass text)
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
  return jsonb_build_object('status', 'ok');
end;
$$;

-- 4. 관리자 통계 (v6과 같은 동작·반환, 비밀번호 확인만 admin_verify로) ----------
create or replace function public.admin_stats(p_pass text, p_days integer default 14)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare
  v jsonb := public.admin_verify(p_pass);
begin
  if v->>'status' <> 'ok' then
    return v;
  end if;
  return public.analytics_report(p_days);
end;
$$;

-- 5. 관리자 피드백 (누구나 호출 가능하지만 비밀번호가 맞아야 내용이 나옴) -------
-- 피드백 목록 내용 (내부용)
create or replace function public.feedback_report(p_limit integer)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'status', 'ok',
    'generated_at', now(),
    'unread', (select count(*) from public.feedback f where not f.read),
    'total',  (select count(*) from public.feedback),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'at', x.at, 'nickname', x.nickname,
                                          'page', x.page, 'message', x.message, 'read', x.read)
                       order by x.at desc, x.id desc)
      from (select f.* from public.feedback f
             order by f.at desc, f.id desc
             limit least(greatest(coalesce(p_limit, 100), 1), 500)) x), '[]'::jsonb));
$$;

-- 목록: {status, items:[{id, at, nickname, page, message, read}] (최신순), unread, total}
create or replace function public.admin_feedback(p_pass text, p_limit integer default 100)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v jsonb := public.admin_verify(p_pass);
begin
  if v->>'status' <> 'ok' then
    return v;
  end if;
  return public.feedback_report(p_limit);
end;
$$;

-- 읽음 표시: {status, found, unread}
create or replace function public.admin_feedback_mark(p_pass text, p_id bigint, p_read boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v jsonb := public.admin_verify(p_pass);
  n integer;
begin
  if v->>'status' <> 'ok' then
    return v;
  end if;
  update public.feedback set read = coalesce(p_read, true) where id = p_id;
  get diagnostics n = row_count;
  return jsonb_build_object('status', 'ok', 'found', n > 0,
                            'unread', (select count(*) from public.feedback f where not f.read));
end;
$$;

-- 삭제: {status, found, unread}
create or replace function public.admin_feedback_delete(p_pass text, p_id bigint)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v jsonb := public.admin_verify(p_pass);
  n integer;
begin
  if v->>'status' <> 'ok' then
    return v;
  end if;
  delete from public.feedback where id = p_id;
  get diagnostics n = row_count;
  return jsonb_build_object('status', 'ok', 'found', n > 0,
                            'unread', (select count(*) from public.feedback f where not f.read));
end;
$$;

-- 6. 권한 -------------------------------------------------------------
-- Supabase는 public 스키마의 새 함수에 anon·authenticated 실행 권한을 자동으로 주므로 명시적으로 거둔다.
revoke all on function public.admin_verify(text)                              from public, anon, authenticated;
revoke all on function public.feedback_report(integer)                        from public, anon, authenticated;
revoke all on function public.submit_feedback(uuid, text, text)               from public;
revoke all on function public.admin_stats(text, integer)                      from public;
revoke all on function public.admin_feedback(text, integer)                   from public;
revoke all on function public.admin_feedback_mark(text, bigint, boolean)      from public;
revoke all on function public.admin_feedback_delete(text, bigint)             from public;
grant execute on function public.submit_feedback(uuid, text, text)            to anon, authenticated;
grant execute on function public.admin_stats(text, integer)                   to anon, authenticated;
grant execute on function public.admin_feedback(text, integer)                to anon, authenticated;
grant execute on function public.admin_feedback_mark(text, bigint, boolean)   to anon, authenticated;
grant execute on function public.admin_feedback_delete(text, bigint)          to anon, authenticated;
