# 방문·플레이 통계 + 관리자 통계 페이지 — QA 리포트

## 2026-11-16 QA — v6 통계(log_event / admin_stats), admin/index.html, lib ?v=7, 안내 문구
판정: **통과** (치명·높음 버그 없음. 보통 1건, 낮음 5건은 배포를 막지 않는 개선 사항)

대상: 브랜치 `claude/admiring-hypatia-dkeaqw` HEAD `dc6b370`.
실서버(Supabase)에는 아무것도 쓰지 않았다. 로컬 Postgres 16 + Playwright 라우팅(PostgREST 흉내, `set role anon`으로 실행)으로 검증했고, 검증 뒤 로컬 DB는 삭제했다.

### 실행한 테스트와 결과

**환경 재현**: initdb(UTF8, C.UTF-8) → 역할 anon/authenticated, `extensions` 스키마 + pgcrypto,
Supabase처럼 `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES/SEQUENCES, EXECUTE ON FUNCTIONS TO anon, authenticated`.
`leaderboard.sql` → v3 → v4 → v5 → v6 → v6 다시 실행: 모두 오류 없음. 다시 실행해도 이벤트·비밀번호 해시가 그대로 남고 권한도 바뀌지 않음.

**1. 보안 점검표 (anon 역할 기준)**

| 항목 | 결과 |
|---|---|
| events / admin_auth / players / devices / scores / player_scores 읽기·쓰기 | 모두 permission denied (RLS 켜짐, 정책 0개) |
| events_id_seq nextval | 거부 |
| public 스키마 뷰·구체화 뷰 | 0개 (다른 노출 경로 없음) |
| anon이 실행 가능한 함수 | v3 7개 + log_event + admin_stats뿐 |
| admin_set_password, analytics_report, analytics_page_of/ok, score_cap 실행 | 모두 거부 |
| 비밀번호 미설정 | `{"status":"no_password"}`만 반환 |
| 틀린 비밀번호 | `{"status":"wrong","tries_left":n}`(36바이트), 통계는 0바이트 |
| 5번 틀리면 잠금 | 5번째에 `locked, seconds_left 900`, DB `fails=0, locked_until≈+15분` |
| 잠긴 동안 맞는 비밀번호 | 거부(locked) |
| 잠금이 풀린 뒤 맞는 비밀번호 | ok, fails 초기화 |
| 맞게 넣으면 실패 횟수 초기화 | 확인 |
| 동시 요청 20개(틀린 비밀번호) | 정확히 5개만 판정되고 나머지는 locked (`FOR UPDATE`로 차례 처리) |
| GET(읽기 전용 트랜잭션)으로 우회 | `SELECT FOR UPDATE` 오류로 정답 여부를 알 수 없음 → 잠금 우회 불가 |
| null·200자 초과·`' or 1=1 --` 비밀번호 | wrong 처리 |
| 비밀번호 저장 형식 | `$2a$10$…` bcrypt 해시만 저장, 8자 미만이면 거부 |
| admin_set_password로 잠금 해제 | 확인 |
| log_event page/game 이상한 값 (`home'; drop table events;--`, `<script>`, 5000자, admin, lab, `bungeo-easy`를 page로, `bungeo-3p`, page·game이 서로 안 맞음, kind=`click`, device null) | 모두 400(bad page / bad game / bad kind / missing value), 표에 들어가지 않음 |
| 중복 창 | 같은 visit은 30분 안에 1건만, play는 20초 안에 1건만. 창이 지나면 다시 기록됨 |
| 기기당 하루 500건 | 500건이 되면 더 받지 않음 |
| days 범위 | -5 → 1, 100000 → 90, null → 14 |
| v3 회귀(claim/whoami/submit/top/my_rank/rename/change_pin) | 정상 (created/wrong_pin/linked, bad score 거부, bad nickname 거부) |

**2. 관리자 페이지** (Playwright, admin_stats 요청을 로컬 DB로 연결)
- noindex,nofollow,noarchive / referrer no-referrer / `<a>` 0개 / leaderboard.js를 요청하지도 불러오지도 않음 / 열 때 log_event 호출 0건: 통과
- 비밀번호 흔적: 로그인 전후와 잠근 뒤에 localStorage·sessionStorage·쿠키·URL(query/hash)을 확인 → 비밀번호 없음. 입력칸은 비워지고, 비밀번호는 메모리에만 있음(`__admin.hasPass`), 잠그기를 누르면 지워짐, 새로고침하면 로그인 화면이고 입력칸이 비어 있음: 통과
- 상태별 화면: ok / wrong(남은 기회 4→1, "마지막 기회") / locked(15:00 카운트다운, 버튼 비활성, Enter도 막힘) / no_password(SQL 안내) / 404("v6 SQL 미적용") / 500 / 연결 안 됨 / 이상한 응답: 모두 맞는 문구
- 대시보드에서 새로고침했는데 연결이 안 되면 대시보드는 그대로 두고 안내 문구만 표시. 기간 7/14/30일을 바꾸면 막대 수와 제목이 바뀜
- **렌더링 정확성**: 60개 기기와 이벤트 1,101건(40일치)을 넣고, admin_stats와 별도로 SQL로 직접 다시 집계해 비교 → 7일/14일/30일 모두 불일치 0건(방문자 오늘/7/30/전체, 페이지뷰, 게임별 플레이·7일·방문자·플레이어·닉네임 없음, 붕어빵 모드별, 일별, 닉네임×게임). 화면의 카드·게임 표 7행·닉네임 표 5행·일별 막대 14개 값도 JSON과 모두 일치
- XSS: DB 닉네임 `<b>X</b>`, `"&'<i>`(8자 제한)와, 모킹으로 넣은 긴 페이로드(닉네임·page·mode·date·generated_at·days에 `<img onerror>`, `<script>`) → 모두 글자로만 보이고 실행·삽입 0건
- 레이아웃: PC, iPad 세로·가로, iPhone 13 세로·가로, 다크(PC·폰). 가로 스크롤 0, 카드 넘침 0, 콘솔 오류 0. 스크린샷을 직접 확인함(폰에서는 방문자·닉네임 없음 열을 숨기고 닉네임 표는 가로 스크롤, 첫 열 고정)

**3. 수집 정확성** (실제 log_event로 연결)
- 홈 + 7개 게임 페이지: 열 때마다 visit 정확히 1회, page 값이 맞음
- 게임 끝 play 1회. 실제로 끝까지 진행:
  - 블록 스택: Space 하드드롭으로 쌓아 게임 오버
  - 뱀 정원, 똥비, 박자 앵무새: 가만히 두어 실패
  - 두더지: 40초 다 기다림
  - 개구리 텐: 120초 다 기다림
  - 붕어빵: 시작 버튼으로 시작한 뒤 `__bungeo.setTime(0)`으로 종료(이때는 eligible=false)
  - 모두 play 1건이고 3.5초 뒤에도 늘지 않음. 순위표에 올라갈 수 있는 판은 eligible=true로 기록
- 붕어빵: bungeo-easy / normal / hard / bungeo-2p 키가 모두 page `bungeo-snowfight`로 기록됨. 2인 판은 eligible=null
- 닉네임이 연결된 기기의 play는 player_id가 붙어 닉네임별 집계에 들어감
- 연구소(lab) 목록 / lab tiny-company / admin: 백엔드 호출 0건
- 닉네임 게이트가 떠 있어도 visit 1건. 저장된 값이 전혀 없는 첫 방문도 새 기기 번호로 visit
- 백엔드 불통: 블록 스택을 게임 오버까지 진행해도 오버레이가 뜨고 오류 0
- iPad 터치: 시작 버튼을 탭하면 뱀 게임 play가 기록됨

**4. 안내 문구**: 닉네임 게이트, 순위표 하단, 내 닉네임 창 3곳 모두 `닉네임, 점수, 플레이기록만 저장돼요. 다른 개인정보는 모으지 않아요.`와 정확히 일치(PC·iPad·폰 가로). 예전 문구는 저장소 어디에도 남아 있지 않음.

**5. 회귀**: `node tests/smoke.js` 전체 통과(목록 7개, 게이트, 관리자 통계 pc/ipad, 7게임×3환경). `--lab` 통과. `?v=7`은 index.html과 7개 게임 모두 같음(lab은 lib를 불러오지 않음). 수집 테스트 중 모든 게임 콘솔 오류 0.

### 버그 (심각도: 치명/높음/보통/낮음)
- [보통] **아무 기기 번호로나 통계를 부풀릴 수 있음.** 중복 창과 하루 500건 상한이 기기 번호(클라이언트가 정하는 무작위 UUID) 기준이라, 요청마다 새 UUID를 쓰면 제한이 없다.
  - 재현: anon으로 `select public.log_event(gen_random_uuid(),'visit','home') from generate_series(1,2000)` → 2,000건이 모두 들어감. play도 같아서 게임 인기 순위를 마음대로 올릴 수 있고, 표도 계속 커진다.
  - 기대: 서버 전체에 분당/일당 상한을 두거나(예: 전체 하루 N건을 넘으면 무시), 최소한 "악의적 조작에 약하다"는 한계를 관리자 화면이나 문서에 적기.
  - 위치: `docs/site/leaderboard-v6-analytics.sql` log_event의 중복·상한 검사(§3). IP를 모으지 않는 설계에서 오는 한계이므로 배포를 막지는 않는다.
- [낮음] **빨리 다시 한 판이 빠짐.** play 중복 창이 서버에서 20초라, 20초 안에 끝난 두 번째 판은 기록되지 않는다.
  - 재현: 블록 스택을 하드드롭으로 끝내고 바로 다시 해서 끝냄 → 클라이언트는 play를 2번 보냈는데 DB에는 1건. 뱀 정원 초보처럼 몇 초 만에 지는 게임에서 실제로 생긴다.
  - 기대: 클라이언트에 이미 3초 중복 방지가 있으니, 서버 창을 3~5초로 줄이기.
  - 위치: log_event `v_window := interval '20 seconds'`
- [낮음] **관리자 비밀번호 잠금으로 관리자를 막을 수 있음.** 잠금이 전체에 하나뿐이라, 누구든 15분마다 틀린 비밀번호를 5번 보내면 관리자가 계속 통계를 볼 수 없다.
  - 우회: SQL Editor에서 admin_set_password를 다시 실행하면 풀림.
  - 위치: admin_stats §6. 무차별 대입 방어와 맞바꾼 설계라 문서에 "잠겼으면 SQL Editor에서 비밀번호를 다시 정하면 풀린다"고 적어 두면 충분하다.
- [낮음] **서버가 내린 게임과 lab 게임 페이지도 받음.** analytics_page_ok/page_of가 score_cap 기준이라 `fake-evidence`(사이트에서 내림)와 `tiny-company`(lab)도 visit/play로 받는다.
  - 재현: `log_event(uuid,'visit','fake-evidence')` 성공
  - 실제 사이트에서는 이 페이지들이 lib를 불러오지 않아 기록되지 않는다. 조작된 요청이 오면 관리자 표에 "증거 조작범" 행이 생길 수 있다.
- [낮음] **관리자 페이지의 tiny-company 이름이 다름.** `NAMES['tiny-company'] = '꼬마 사장님'`인데 실제 게임 제목은 "악덕 사장"이다. 출시 전이라 지금은 보이지 않는다.
  - 위치: `admin/index.html` NAMES
- [낮음] **"플레이한 닉네임"이 "등록 플레이어"보다 많을 수 있음.** 플레이어를 지우면(초기화 등) 그 사람의 events가 남아 "(지워진 플레이어)"로 집계된다. 그래서 카드에 "등록 플레이어 4 / 플레이한 닉네임 5명"처럼 보일 수 있다. 의도한 동작이면 문제없다.
- 참고(이번 변경과 무관, 기존 동작): 화면 높이가 260px 미만이면 닉네임 게이트가 `lb-tiny`로 안내 문구를 숨긴다. 폰 가로 화면에서 키보드가 올라온 경우처럼 매우 드문 상황이다.

### 실기기 확인 필요
- 실서버에 v6 SQL을 적용한 뒤 Supabase PostgREST에서 admin_stats(POST) 응답, 잠금 동작, 404→"SQL 미적용" 문구 (로컬에서는 PostgREST를 흉내 내서만 검증함)
- iPad Safari에서 관리자 페이지 비밀번호 입력: 키체인이 "암호 저장"을 제안할 수 있음(`autocomplete=current-password`). 저장 여부는 사용자가 선택. 페이지 자체는 저장하지 않음
- iPad Safari(WebKit)의 레이아웃·sticky 첫 열·SVG 막대
- Supabase SQL Editor 기록에 `admin_set_password('…')` 문장이 남을 수 있으니, 실행한 뒤 저장된 스니펫이나 기록을 지우도록 안내 권장
