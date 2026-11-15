# 사이트 공통 온라인 순위표 기획서
- slug: (사이트 공통) — 모듈 `lib/leaderboard.js`
- 한 줄 소개: 게임이 끝나면 내 기록이 온라인 순위표에 올라가고, "내 순위 N위 · M명"과 상위 20명을 볼 수 있다.
- 사용자 요청 원문: "방문한 사람들의 기록이 남았으면 좋겠어. 최고기록 등을 기록해서 순위도 매기고 나는 몇등인지도 확인가능하게"
- 백엔드: Supabase (사용자가 프로젝트 생성·`docs/site/leaderboard.sql` 실행 완료). 이 문서의 "추가 SQL"은 **한 번 더 실행**해야 한다.
- **v3(2026-11-15)**: 닉네임 필수 + 유일 닉네임·숫자 4자리 PIN + 기록은 닉네임(플레이어) 단위 + 붕어빵 눈싸움 난이도별 순위. **v3 절이 1~7장과 다른 부분은 v3이 우선**한다(맨 아래 "v3" 절).

## 핵심 루프
게임 끝 → 결과 화면 → (처음 한 번) 닉네임 등록 → 기록 자동 제출 → 결과 화면에 "내 순위 N위 · M명" → [순위표] 버튼으로 상위 20 + 내 줄 확인 → 다시 하기.

## 규칙

### 1. 순위 대상·순위 점수
- 대상 6개: poop-rain, mole-pop, bunny-ten, snake-garden, block-stack, parrot-beat. **붕어빵 눈싸움(bungeo-snowfight)은 제외**(승패제).
- 순위 = 기기(device_id)당 게임별 **최고 점수 1줄**. 높은 점수가 위, 같은 점수면 **먼저 세운 사람이 위**(서버 규칙, 동순위 없음).
- 점수 0은 제출하지 않는다.
- "제출 자격(eligible)"이 없는 판은 제출하지 않는다(아래 표). 기존 게임의 "최고 기록 저장 조건"과 같게 맞춘다.

| 게임 | 순위 점수 (결과 화면 숫자) | 단위 | 제출 자격 (아니면 제출 안 함) | 이론상 최대 (근거) | **서버 상한** |
|---|---|---|---|---|---|
| poop-rain | `G.score` = floor(시간×10) + 별사탕 점수 | 점 | `!G.noSave && !G.simUsed` (기존 `canSave`와 동일) | 시간 무제한. 초당 시간 10 + 별사탕 최대 약 29(100점/3.5초) ≈ 39점/초 → 10분 약 23,400 | **50,000** |
| mole-pop | `score` (40초 종료 시) | 점 | 테스트 훅 `__mole.spawn/setTime`을 이 판에 쓰지 않음 | 등장 약 85회(구간별 간격 720/540/400/360ms), 황금 ≤ 14회(3초 간격), 최대 배율 ×3 → 약 4,500 | **10,000** |
| bunny-ten | `score` = 지운 개구리 수 | 마리 | 테스트 훅 `__bunny.newBoard/solution`을 이 판에 쓰지 않음 | 판 17×10 = **170** (정확한 최대) | **170** |
| snake-garden | `score` (열매 10, 황금 50) | 점 | 항상 (훅이 읽기 전용) | 15×15 = 225칸, 시작 3칸 → 222개 먹기. 황금 ≤ 열매/5 → 열매 185×10 + 황금 37×50 = 3,700 | **4,000** |
| block-stack | `score` (줄 지우기 ×레벨 + 소프트 1/칸 + 하드 2/칸) | 점 | 항상 (훅 없음) | 레벨 상한 없음(무한). 레벨 L까지 테트리스만 하면 약 1,000×L² → 레벨 70 ≈ 490만 | **5,000,000** |
| parrot-beat | `g.score` (최종) | 점 | `G.retries === 0` **그리고** `G.startStage === 1` **그리고** 이 판에 `__parrot.autoPlay`를 켜지 않음 | 24라운드 × 라운드당 최대 8음 × 200(딱 100×2배) = 38,400 + 라운드 보너스 10,800 + 무결점 4,000 + 클리어 3,000 = 56,200 | **60,000** |

- parrot-beat "이어하기(틀린 곳부터)"를 1번이라도 쓴 판은 순위 제출 안 함 → 기존 "최고 기록 미반영" 규칙과 일치. 결과 화면 순위 줄에 "이어하기 판은 순위에 안 올라가요" 표시.
- 테스트 훅으로 상태를 바꾼 판 = "오염(tainted)" 판. 게임 쪽에서 훅 호출 시 그 판의 `tainted = true`, 새 판 시작 시 false로 되돌린다.
- 상한은 치팅 1차 필터일 뿐이다(누구나 API를 직접 부를 수 있다). 상한을 넘는 제출은 서버가 거부 → 클라이언트는 상한 초과 점수를 보내지 않는다(같은 표를 `CONFIG`에도 둠).

### 2. 제출 흐름
1. 결과 화면이 뜰 때 게임이 `Leaderboard.report({ game, score, eligible, slot })` 한 번 호출.
2. **닉네임이 없으면**: 순위 줄에 `[순위에 이름 올리기]` 버튼만 표시. **자동으로 창을 띄우지 않는다**(Space/Enter 다시 하기 흐름을 막지 않기 위해). 누르면 닉네임 입력 창.
3. **첫 등록(닉네임 저장 순간)**: 이 기기에 있는 **6개 게임의 로컬 최고 기록**(아래 키)과 이번 판 점수(eligible일 때) 중 큰 값을 게임별로 대기열에 넣고 바로 보낸다. 0·상한 초과는 제외.
4. **이후 자동 제출**: eligible이고 `score > sent[game]`(서버에 올라간 내 최고)일 때만 `submit_score`. 아니면 읽기 전용 `my_rank`로 순위만 갱신 표시.
   - `sent[game]`이 없는데 닉네임은 있는 경우(다른 게임에서 등록) → 이번 판과 로컬 최고 중 큰 값 제출.
5. **닉네임 변경**: 순위표 창 맨 아래 "닉네임: ○○ · [바꾸기]". 저장하면 `sent`에 있는 모든 게임을 같은 점수로 다시 `submit_score`(점수는 높을 때만 갱신, 닉네임은 항상 최신 → 이름만 바뀜). 같은 대기열 경로 사용.
6. **실패·오프라인**: 알림창·소리 없이 조용히. 대기열에 남기고 순위 줄은 흐린 글씨 "연결되면 순위에 올라가요".
   - 대기열 `studio-lb-queue` = `{ <game>: { score, at } }` (게임당 1개, 더 높은 점수만 남김. 닉네임은 보낼 때 현재 값 사용).
   - 재시도 시점: 모듈 로드 시(아무 게임·홈 진입), `online` 이벤트, 다른 호출 성공 직후. 한 번에 순서대로, 실패하면 그 자리에서 중단.
   - 요청 타임아웃 **6초**(AbortController). 서버가 `bad nickname`/상한 등 4xx로 거부하면 그 항목은 대기열에서 **삭제**(무한 재시도 방지). 네트워크 오류·5xx만 남긴다.
   - 성공 응답 `[{rank,total,best,nickname}]` → `sent[game] = best`.

### 3. 닉네임 규칙
- 입력창 `maxlength` 8, 앞뒤 공백 제거·연속 공백 1칸으로. 1~8자(코드포인트 기준, 서버 `char_length`와 동일).
- 허용 문자: 한글(가-힣, ㄱ-ㅎ, ㅏ-ㅣ), 영문, 숫자, 공백, `_` `-` `.`. 그 외(이모지·기호·제어문자) 거부.
- 차단: 숫자 **5개 이상**(전화번호 형태), `@`(이메일), `http`·`www`·`.com`·`.kr`·`.net`(주소), 간단 금칙어 — 공백·`_-.` 제거 후 소문자로 부분 일치:
  `시발 씨발 ㅅㅂ ㅆㅂ 병신 ㅂㅅ 개새 좆 존나 지랄 미친놈 미친년 섹스 fuck shit sex bitch 운영자 관리자 admin`
- 거부 시 입력창 아래 한 줄: "8자 이내 한글·영문·숫자로 적어 주세요" / "전화번호·이메일·주소는 쓸 수 없어요" / "다른 이름을 써 주세요".
- 입력창: 엔터=저장, Esc=취소. iPad에서 키보드가 올라와도 입력창이 가려지지 않게 창을 화면 위쪽에 배치(art-ui 위임).
- 서버도 같은 기본 검사(길이·`@`·숫자 5개·제어문자)를 한다(추가 SQL).

### 4. 보기
- **결과 화면 순위 줄**(게임이 제공하는 슬롯 1줄): 상태별 문구
  | 상태 | 문구 |
  |---|---|
  | 닉네임 없음 | `[순위에 이름 올리기]` |
  | 보내는 중 | "순위 확인 중…" |
  | 성공 | "내 순위 **N**위 · M명" + `[순위표]` (이번에 서버 최고 갱신이면 "새 순위!" 작은 배지) |
  | 기록 없음(서버에 내 줄 없음, 점수 0 등) | "기록을 세우면 순위에 올라가요" + `[순위표]` |
  | 자격 없음 | parrot-beat: "이어하기 판은 순위에 안 올라가요" / 그 외 오염 판: "테스트 판은 순위에 안 올라가요" + `[순위표]` |
  | 실패·오프라인 | (흐리게) "연결되면 순위에 올라가요" |
- **순위표 창(모달)**: 제목 "<게임 이름> 순위", `top_scores(p_limit=20, p_device=내 id)`.
  - 표: 순위 · 닉네임 · 점수(+단위). 1~3위는 금·은·동 표시(art-ui).
  - `is_me` 줄 하이라이트. 내가 20위 밖이면 `my_rank` 호출 → 표 아래 "⋯" 구분선 + 내 줄(하이라이트).
  - 아무도 없으면 "아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!"
  - 아래쪽: "닉네임: ○○ · [바꾸기]"(없으면 `[이름 정하기]`), 개인정보 안내 한 줄, 닫기.
  - 닫기: X 버튼, Esc, 바깥 탭. 열려 있는 동안 게임 키(Space/Enter 등)가 먹히지 않게 모듈이 막는다(5장).
  - 불러오기 실패: "지금은 순위를 불러올 수 없어요" + `[다시 시도]`.
- **홈(index.html)**: 제목 줄 오른쪽에 `순위` 버튼 1개 → 같은 모달을 **게임 탭 6개**(최신 순, 카드 순서와 동일)로 연다. 카드(`<a>`) 안에는 버튼을 넣지 않는다(링크 안 버튼 = 접근성 오류·오탭). 처음 탭은 마지막으로 플레이한 게임(`studio-lb-last`), 없으면 첫 탭.

### 5. 공통 모듈 — 결정: **공통 파일 `lib/leaderboard.js` 1개**
- 이유: 7개 페이지(게임 6 + 홈)가 같은 설정·닉네임 창·순위표 UI·대기열을 쓴다. 인라인이면 수정 때마다 7곳을 고쳐야 하고 어긋나기 쉽다. 설정값(URL·키·게임 표·상한)은 이 파일 맨 위 `CONFIG` **한 곳**.
- 배포: `.github/workflows/pages.yml` Prepare site에 `cp -r lib _site/` 추가(지금은 index.html·games만 복사 → 안 하면 실서버에서 404).
- 불러오기: 게임은 `<script src="../../lib/leaderboard.js?v=1" defer></script>`, 홈은 `lib/leaderboard.js?v=1`. 파일을 바꿀 때마다 `?v=` 숫자를 올린다(캐시).
- **게임은 모듈 없이도 정상 동작해야 한다**: 모든 호출은 `window.Leaderboard && Leaderboard.report(...)` 형태. 파일 404·스크립트 오류여도 게임·최고 기록 저장은 그대로.
- CSS는 모듈이 `<style id="lb-style">`로 한 번 주입, 모든 클래스 `lb-` 접두사. 글꼴은 `inherit`, 색은 게임의 CSS 변수가 없으면 기본값.
- 공개 API:
  - `Leaderboard.report({ game, score, eligible, slot })` — slot = 결과 화면의 빈 요소. 그 안을 모듈이 채움.
  - `Leaderboard.open(game?)` — 순위표 모달. game 생략 시 탭 모드(홈).
  - `Leaderboard.isOpen()` — 모달·닉네임 창이 열려 있는지.
- 입력 차단: 모달이 열려 있으면 window `keydown`(capture 단계)에서 `stopImmediatePropagation`(입력창 타이핑은 그대로 허용, Esc는 모달 닫기). 모달 루트에서 `pointerdown`·`touchstart`·`click` 전파 차단. 그래도 게임 쪽 키 핸들러 맨 앞에 `if (window.Leaderboard && Leaderboard.isOpen()) return;` 한 줄 추가(이중 안전).
- 호출: `fetch(POST {URL}/rest/v1/rpc/<fn>, headers {apikey: KEY, 'Content-Type': 'application/json'}, body JSON)`. Authorization 헤더 없음.

`CONFIG` (lib/leaderboard.js 맨 위)
```
url: 'https://zzynabrqpwognuwmznna.supabase.co'
key: 'sb_publishable_fctxHgfDR0OqyV4Jwb2zqg_rKHf2mDG'
timeoutMs: 6000, topN: 20
games (홈 탭 순서 = 카드 순서):
  parrot-beat  : 박자 앵무새, 단위 점,   cap 60000,   localBest = JSON(parrot-beat-best).score
  poop-rain    : 똥비 피하기, 단위 점,   cap 50000,   localBest = int(poop-rain-best-score)
  mole-pop     : 두더지 뿅뿅, 단위 점,   cap 10000,   localBest = int(mole-pop-best)
  bunny-ten    : 개구리 텐,   단위 마리, cap 170,     localBest = int(bunny-ten-best)
  snake-garden : 뱀 정원,     단위 점,   cap 4000,    localBest = int(snake-garden-best)
  block-stack  : 블록 스택,   단위 점,   cap 5000000, localBest = int(blockstack-best)
```
(로컬 최고는 첫 등록 때만 읽는다. 값이 이상하면 0으로.)

### 6. 기기 번호·저장 키 (사이트 공통, 같은 origin)
| 키 | 내용 |
|---|---|
| `studio-device-id` | UUID v4. `crypto.randomUUID()` → 없으면 `crypto.getRandomValues` 16바이트로 v4 조립 → 그것도 없으면 `Math.random`. 읽을 때 UUID 형식 검사, 틀리면 새로 만듦 |
| `studio-nickname` | 닉네임(검사 통과한 값만) |
| `studio-lb-sent` | `{ <game>: 서버에 올라간 내 최고 }` |
| `studio-lb-queue` | 대기열(2장) |
| `studio-lb-last` | 마지막으로 report한 게임 slug(홈 탭 기본값) |
- localStorage 접근 실패(사파리 사생활 모드 등): 메모리 값으로 이번 방문 동안만 동작, 오류 없이.
- 실서버 device_id를 지우는 기능은 없음(범위 밖). 사이트 데이터를 지우면 새 사람으로 취급됨 → 안내하지 않음.

### 7. 개인정보 안내 (닉네임 창·순위표 아래 한 줄)
> 순위표에는 닉네임과 점수만 공개돼요. 이 기기에는 무작위 번호만 저장되고, 다른 개인정보는 모으지 않아요.

## 조작
| 동작 | PC | iPad 터치 |
|---|---|---|
| 순위표 열기 | 결과 화면 `[순위표]` 클릭 / Tab 포커스 후 Enter | 탭 |
| 닫기 | Esc, X, 바깥 클릭 | X, 바깥 탭 |
| 닉네임 저장 | Enter / 저장 버튼 | 키보드 "완료"·저장 버튼 |
| 홈 탭 전환 | 클릭, ←/→ (탭 포커스 시) | 탭 |
- 버튼 최소 터치 영역 44×44px. 순위 목록은 창 안에서만 세로 스크롤(`touch-action: pan-y`, `overscroll-behavior: contain`).
- 결과 화면 기존 키(Space/Enter = 다시 하기)는 그대로. 순위 버튼에 포커스가 있을 때 Enter는 버튼 동작(브라우저 기본).

## 결과 화면 레이아웃 원칙 (깨짐 방지)
- 모듈이 쓰는 공간 = **게임이 미리 만든 슬롯 1줄**만. 슬롯은 처음부터 `min-height: 32px`로 자리를 잡아 두어 문구가 바뀌어도 화면이 들썩이지 않게.
- 한 줄 고정: `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`, 글자 크기 = 결과 화면 보조 문구와 같거나 작게. 버튼은 줄 안 작은 알약형.
- 슬롯 위치: 점수·보조 정보 아래, "다시 하기" 버튼 위. "다시 하기"가 여전히 가장 큰 버튼.
- block-stack은 시작·일시정지·게임오버가 같은 오버레이 → 슬롯은 **게임오버일 때만 보이고** 시작·일시정지 때 숨김.
- 화면이 작아 결과 카드가 넘치면 카드 안 세로 스크롤 허용(잘림 금지). 순위표·닉네임 창은 `max-height: 90dvh`(미지원 시 90vh), 안쪽 목록 스크롤.
- 확인 화면 크기: PC 1280×800, iPad 세로 820×1180·가로 1180×820, **폰 가로 844×390·667×375**, 폰 세로 390×844. 결과 화면에서 "다시 하기"·순위 줄·순위표 창 닫기 버튼이 모두 화면 안에 보이고 겹치지 않아야 함.

## 테스트 방법 (실서버에 점수 쓰기 금지)
- 실서버에는 **읽기 전용 `top_scores` 호출만** 허용(삭제 수단 없음). `submit_score`·`my_rank`도 실서버 금지(my_rank는 읽기지만 불필요).
- **`tests/smoke.js` 기본값**: 모든 `**/*.supabase.co/**` 요청을 `route.abort()` → 스모크 테스트가 실서버를 절대 건드리지 않고, "백엔드 불통이어도 게임 정상" 회귀를 겸한다.
- 모킹 검증: Playwright `page.route('**/rest/v1/rpc/**', ...)`로 가짜 응답.
  1. 요청 확인: POST, 헤더 `apikey` 값, body `{p_game,p_device,p_nick,p_score}` 정확, Authorization 없음.
  2. 첫 방문: 닉네임 없음 → 버튼만, 자동 창 없음. 닉네임 등록 → 로컬 최고가 있는 게임 수만큼 submit.
  3. 점수 ≤ sent → submit 안 하고 my_rank만. 점수 > sent → submit 1회.
  4. eligible=false(parrot 이어하기, 오염 판) → submit 없음, 해당 문구.
  5. 실패: abort/500 → 대기열 저장·문구 흐림·콘솔 오류 없음. 새로 고침(또는 `online`) → 재전송 성공 시 대기열 비움. 400 응답 → 대기열에서 삭제.
  6. 순위표: 20줄 + 내 줄 하이라이트 / 20위 밖이면 구분선 + 내 줄 / 0명 문구 / 실패 문구.
  7. 닉네임 검사: `01012345`, `a@b`, `www.kr`, 금칙어, 9자, 공백만, 이모지 → 거부. `콩이`, `Kong_7`, `토끼 99` → 통과.
  8. 모달 열린 상태에서 Space/Enter → 게임 재시작 안 됨. 닫은 뒤 정상.
  9. `lib/leaderboard.js` 요청을 abort → 6개 게임 모두 정상 플레이·결과·최고 기록 저장.
- 테스트 훅 `window.__lb`(열거 안 됨): `state()` → `{deviceId, nickname, sent, queue}`, `flush()` → Promise(대기열 전송), `reset()` → `studio-*` 키 삭제, `allowTainted(bool)` → 오염 판도 제출(모킹 환경에서 훅으로 결과 화면을 만든 뒤 제출 흐름을 시험할 때만).
- 실서버 읽기 확인(1회): `top_scores {p_game:'poop-rain', p_limit:1}` → 200 + 배열.

## 추가 SQL (사용자가 Supabase SQL Editor에서 한 번 더 Run)
기존 `submit_score`를 같은 이름·인자로 교체(권한 유지). 게임별 상한, 음수 거부, 닉네임 기본 검사 추가. `docs/site/leaderboard.sql` 끝에도 같은 내용을 붙여 둔다(개발자).

```sql
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
```
- 확인(읽기 전용): SQL Editor에서 `select public.score_cap('bunny-ten');` → 170.
- `raise exception`은 PostgREST에서 HTTP 400 → 클라이언트는 대기열에서 삭제(2장).

## v3 — 닉네임 필수·PIN 이어하기·플레이어 단위 기록·붕어빵 순위 (2026-11-15)

사용자 요청 원문: "눈싸움 붕어빵도 난이도별로 AI를 몇%로 이겼는지로 순위 기록해줘. 1:1은 그대로 순위 기록안해도 되고. 사이트에 접속하는 모든사람은 시작 전에 닉네임을 입력하게해줘. 다시 접속해도 같은 닉네임으로 계속 플레이 가능하도록도 해줘"
사용자 결정: "점수는 그 닉네임으로 최고기록을 세우면 자동 기록되게해주고 짧은 PIN(숫자4개) 방식이 좋을듯" / 붕어빵 순위 기준 = **이긴 판의 내 땅 %** (승률 아님).

### v3-1. 바뀌는 것 한눈에
| 항목 | v2까지 | v3 |
|---|---|---|
| 닉네임 받는 시점 | 결과 화면 `[순위에 이름 올리기]`(선택) | **첫 방문 시 닉네임 창(게이트)**, 통과 전 게임 시작 불가, 건너뛰기 없음 |
| 닉네임 중복 | 허용 | **유일** (대소문자·공백·`_` `-` `.` 무시) |
| 다른 기기 | 새 사람 | **닉네임 + 숫자 4자리 PIN**으로 이어받기 |
| 기록 주인 | 기기(device_id) | **플레이어(닉네임 계정)**. 순위는 플레이어당 1줄 |
| 제출 | 닉네임 있으면 자동 | 최고 기록을 세우면 **항상 자동**(버튼·확인 없음) |
| 대상 게임 | 6개 | 6개 + **붕어빵 3개 순위**(쉬움/보통/어려움) = 키 9개 |

### v3-2. 결정과 이유
1. **기록은 플레이어 단위** (기기 단위 아님). 사용자가 원하는 것은 "같은 닉네임으로 계속"이므로 새 기기에서 이어받으면 기록도 같이 따라와야 한다. 기기 단위로 두면 같은 사람이 순위에 두 줄로 나오고, 이어받은 기기의 최고가 따로 논다.
   - 서버: `players`(닉네임 계정) · `devices`(기기 → 플레이어) · `player_scores`(게임별 플레이어 최고 1줄). 옛 `scores` 표는 지우지 않고 보관(옮기기 원본).
   - 모든 함수는 지금처럼 `p_device`를 받고, 서버가 `devices`로 플레이어를 찾는다 → 클라이언트 요청 형식은 거의 그대로.
2. **유일 닉네임 + PIN 필수(4자리 숫자)**. PIN이 없으면 캐시 삭제·기기 변경 때 자기 이름을 되찾을 방법이 없고(유일 닉네임이라 다시 쓸 수도 없음), PIN 없이 유일만 하면 누구나 남의 이름을 가져간다. 닉네임 창 한 장에 칸 하나 더 늘어나는 비용으로 두 문제가 다 풀린다.
   - 한 번의 입력으로 처리: **없는 이름이면 새로 만들기, 있는 이름이면 PIN이 맞을 때 이어받기**. "새로 만들기/불러오기" 버튼을 따로 두지 않는다.
   - PIN은 서버에 `crypt(pin, gen_salt('bf', 8))` 해시로만 저장. 닉네임(계정)마다 **5번 틀리면 15분 잠금**.
   - PIN을 잊으면: 지금 쓰던 기기에서는 계속 플레이 가능(기기 기억). 다른 기기 이어받기만 불가. PIN 재설정은 범위 밖.
3. **서버 불통 시 게이트**: 닉네임을 입력하고 [시작하기]를 눌렀는데 **네트워크 오류·타임아웃·5xx**면 "임시 등록(pending)"으로 받아들이고 게임을 시작하게 한다. 이유: Supabase 무료 프로젝트는 오래 안 쓰면 일시 정지되는 등 서버가 멈출 수 있는데, 그때 사이트 전체가 막히면 안 된다. 사용자는 닉네임을 이미 입력했으므로 "시작 전 닉네임 입력" 요구는 지킨다.
   - pending 동안 기록은 대기열에 쌓고, 다음 로드·`online` 때 같은 닉네임·PIN으로 등록을 다시 시도. 성공하면 대기열 전송.
   - 다시 시도한 결과가 `taken`/`wrong_pin`/`locked`이면 **다음 페이지 로드 때**(게임 중 아님) 게이트를 다시 연다(입력값 채움 + 해당 문구). 대기열은 최종으로 연결된 플레이어로 보낸다(같은 사람이 친 판이므로).
4. **모듈 로드 실패 시 게이트 없이 게임 가능**(안전장치). 게임은 지금처럼 `window.Leaderboard &&` 형태로만 부른다. 파일 404 하나로 사이트 전체가 멈추지 않게.
5. **붕어빵 순위 = 이긴 판의 내 땅 %** 난이도별 최고. 다른 게임과 같은 "최고 기록" 모델 → 별도 통계 표 없이 같은 `player_scores`를 쓴다. 승률·판수·최소 판수는 만들지 않는다.
6. **붕어빵 로컬 "최고 %"는 이긴 판만 갱신하도록 바꾼다**. 지금은 진 판도 `p1Pct > rec.best`면 갱신돼 서버 순위(이긴 판만)와 숫자가 어긋난다. 기존에 저장된 값은 이긴 판 값인지 알 수 없지만 **지우지 않고 그대로 둔다**(사용자 데이터 보존). 앞으로는 이긴 판으로만 올라간다. 시작 화면 문구 "승리 N · 최고 X%"와 결과 화면 기록 줄은 형식 그대로.
7. **붕어빵 로컬 최고는 첫 등록 일괄 업로드에서 제외**. 위 이유로 기존 값이 이긴 판에서 나왔는지 보장되지 않는다. 붕어빵 순위는 이번 배포 뒤 컴퓨터 대전 승리부터 새로 쌓인다.

### v3-3. 붕어빵 눈싸움 순위
- 순위 키 3개: `bungeo-easy`, `bungeo-normal`, `bungeo-hard`. 서버 상한 **1000**(= 100.0%).
- 점수 = 결과 화면 내 땅 % × 10 정수: `Math.round(S.result.p1Pct * 10)` (예: 54.2% → 542). 판은 16×10 = 160칸이라 한 칸 = 0.625%, 최소 이긴 점수 6(0.6%), 최대 1000.
- 표시: `(score / 10).toFixed(1) + '%'` (예: 542 → "54.2%"). 단위 칸에는 따로 단위를 붙이지 않는다.
- 같은 %면 먼저 세운 사람이 위(다른 게임과 같은 서버 규칙).

| 판 결과 | 제출 | 결과 화면 순위 줄 |
|---|---|---|
| 컴퓨터 대전 **승리** (`S.mode==='ai' && winner===1`), 오염 아님 | `report({game:'bungeo-'+S.diff, score: round(p1Pct*10), eligible:true, slot})` → 서버 최고보다 크면 자동 제출 | 다른 게임과 같음("내 순위 N위 · M명", 갱신 시 "새 순위!") |
| 컴퓨터 대전 **패배·무승부** | `report({game, score:0, eligible:true, slot})` → 제출 없음, `my_rank`로 내 순위만 | 순위 있으면 "내 순위 N위 · M명", 없으면 **"이기면 순위에 올라가요"** |
| 2인 대전 | `report` 호출 안 함, 슬롯 숨김 | (없음) |
| 오염 판 | `eligible:false, reason:'test'` | "테스트 판은 순위에 안 올라가요" |
- 무승부: 칸 수 같음(`winner === 0`)이 실제로 있다(코드 확인). 이긴 판이 아니므로 제출 안 함.
- 도중 나가기·일시정지 후 처음부터/모드 바꾸기: 결과가 없으므로 아무것도 제출 안 함(최고 기록 방식이라 "진 판" 처리가 필요 없음).
- **오염(tainted)**: `window.__bungeo`의 상태를 바꾸는 훅 `start, setTime, throwAt, throwRaw, setCell, placeObstacle, setAI, setAI1, simulate, seed` 중 하나라도 이 판에 쓰면 `S.tainted = true`. `state`, `tip`은 읽기 전용이라 제외. `newGameState()`에서 `false`로 되돌리고, `start` 훅은 `startGame` 호출 **뒤에** true로 만든다.
- 로컬 최고(결정 6): `showResult()`에서 `if (winner === 1 && p1Pct > rec.best) { isNew = true; rec.best = p1Pct; }` 로 바꾼다("새 기록!" 배지도 이긴 판에서만).

### v3-4. 닉네임 게이트 (첫 방문)
- **언제**: `lib/leaderboard.js`를 불러오는 모든 페이지(홈 + 게임 7개)에서, 로드 시 `studio-nick-state`가 `ok`도 `pending`도 아니면 즉시 연다. 홈에서도 카드 목록을 덮는다.
- **닫을 수 없음**: X·나중에·바깥 탭·Esc 모두 없음/무시. 열려 있는 동안 `isOpen() === true` → 기존 키·포인터 차단이 그대로 적용.
- **내용**(문구, 배치는 art-ui):
  - 제목 "닉네임을 정해 주세요"
  - 칸 1: 닉네임 (최대 8자, 기존 규칙). 기기에 옛 `studio-nickname`이 있으면 채워 둔다.
  - 칸 2: 비밀번호 숫자 4자리 (`inputmode="numeric"`, `maxlength 4`, 숫자 외 입력 무시, 가림 표시, iPad 숫자 키패드)
  - 안내: "다른 기기에서도 이 닉네임과 비밀번호로 이어서 할 수 있어요." / 옛 닉네임을 채운 경우: "전에 쓰던 닉네임이에요. 비밀번호 4자리를 정해 주세요."
  - 개인정보 한 줄(7장) + 버튼 `[시작하기]`(두 칸이 형식에 맞을 때만 활성). Enter = 시작하기(IME 조합 중 제외).
- **클라이언트 검사**: 기존 닉네임 규칙 + **한글·영문·숫자가 1글자 이상**(`_-. `만으로 된 이름 거부, 서버 `nick_key`가 비면 거부와 일치). PIN `/^[0-9]{4}$/` 아니면 "비밀번호는 숫자 4자리예요".
- **서버 호출** `claim_nickname {p_device, p_nick, p_pin}` → `[{status, nickname, tries_left}]`

| status | 처리 | 문구(창 안 한 줄) |
|---|---|---|
| `created` | 등록 완료. **일괄 업로드**(아래) | — (창 닫힘) |
| `same` | 이 기기의 내 닉네임(옛 기록 기기는 이때 PIN이 정해짐). **일괄 업로드** | — |
| `linked` | 다른 기기 닉네임 이어받음. `studio-lb-sent` 비움. 로컬 최고 일괄 업로드 **안 함**(이 기기의 옛 기록이 다른 사람 것일 수 있음) | — |
| `taken` | 창 유지 | "이미 쓰는 닉네임이에요. 다른 이름을 써 주세요" |
| `wrong_pin` | 창 유지, PIN 칸 비우고 포커스 | "비밀번호가 맞지 않아요 (남은 기회 N번). 처음이라면 다른 닉네임을 써 주세요" |
| `locked` | 창 유지 | "비밀번호를 여러 번 틀렸어요. 15분 뒤에 다시 하거나 다른 닉네임을 써 주세요" |
| HTTP 400 (`bad nickname`/`bad pin`) | 창 유지 | 기존 형식 문구 "8자 이내 한글·영문·숫자로 적어 주세요" / "비밀번호는 숫자 4자리예요" |
| 네트워크 오류·타임아웃·5xx | **pending**으로 받아들이고 창 닫음(결정 3) | — |
- 성공 시 서버가 돌려준 `nickname`을 `studio-nickname`에 저장(이어받기면 원래 표기로 바뀜), `studio-nick-state = 'ok'`, `studio-pin-pending` 삭제.
- **일괄 업로드**(`created`/`same`일 때, 기기당 1번 — `studio-lb-seeded = '1'`): 6개 게임 로컬 최고를 기존 방식대로 대기열에 넣고 전송. **붕어빵은 제외**(결정 7). 서버 쪽에서도 처음 등록하는 기기의 옛 `scores` 기록을 새 플레이어로 옮긴다(SQL, 중복돼도 최고만 남음).
- 결과 화면 `[순위에 이름 올리기]` 상태(`nonick`)와 "나중에" 버튼은 **없앤다**. 게이트를 통과했으므로 결과 화면은 항상 제출·순위 흐름.

### v3-5. 이후 흐름
- **자동 기록**: 결과 화면 `report()` → 이번 점수가 `sent[game]`보다 크면 `submit_score` (사용자 결정 1, 지금과 같음).
  - 바뀌는 점: `sent[game]`이 없을 때 **이번 판 점수만** 보낸다(로컬 최고는 일괄 업로드 때만 읽음). 이어받은 기기에서 다른 사람의 로컬 최고가 섞이지 않게.
  - `submit_score`의 `p_nick`은 서버가 무시(호환용). 클라이언트는 현재 닉네임을 그대로 넣어 보내도 된다.
- **pending 상태**의 `report()`: 대기열에 넣고 순위 줄 "연결되면 순위에 올라가요". `flush()`는 pending이면 먼저 `claim_nickname`(저장해 둔 닉네임·`studio-pin-pending`)을 다시 시도하고, `ok`가 된 뒤 대기열을 보낸다.
- **로드 시 확인**: `ok` 상태면 `whoami {p_device}` 1회 → 행이 있으면 닉네임을 서버 값으로 맞춤(다른 기기에서 이름을 바꾼 경우). **행이 없으면**(서버에서 이 기기를 모름) `studio-nick-state` 삭제 후 게이트(닉네임 채움). `has_pin === false`이면 게이트(옛 닉네임 채움, PIN 정하기 문구). 네트워크 실패면 아무것도 안 함.
- **순위표 아래 줄**: "닉네임: ○○ · `[이름 바꾸기]` · `[다른 닉네임으로]`"
  - 이름 바꾸기: 닉네임 칸 1개 창(닫기 가능) → `rename_nickname {p_device, p_nick}` → `ok`면 저장·목록 다시 불러오기, `taken`이면 "이미 쓰는 닉네임이에요. 다른 이름을 써 주세요". 기록·PIN 유지.
  - 다른 닉네임으로(형제가 같은 iPad를 쓸 때 등): 게이트와 같은 창이지만 **닫기 가능**. [확인] 전에 대기열을 먼저 `flush()`. 성공(`created`/`linked`/`same`) 시 `studio-lb-sent`·대기열 비움. 일괄 업로드는 하지 않음(이미 seeded).
- **대기열 항목에 플레이어 표시 없음**: 대기열은 항상 "지금 이 기기에 연결된 플레이어" 것으로 보낸다. 다른 닉네임으로 바꿀 때만 먼저 비운다(위).

### v3-6. 저장 키 (추가·변경)
| 키 | 내용 |
|---|---|
| `studio-nickname` | (그대로) 현재 닉네임. 서버 응답으로 갱신 |
| `studio-nick-state` | **새로** `'ok'` = 서버 등록 완료 / `'pending'` = 서버 불통으로 임시 등록 / 없음 = 게이트 열기 |
| `studio-pin-pending` | **새로** pending일 때만 PIN 4자리(재시도용). 등록 성공·다른 결과 확정 시 즉시 삭제. 그 외에는 PIN을 어디에도 저장하지 않음 |
| `studio-lb-seeded` | **새로** `'1'` = 이 기기의 로컬 최고 일괄 업로드 끝 |
| `studio-lb-last` | (그대로) 붕어빵은 `bungeo-normal`처럼 난이도 키를 저장 |
- `__lb.reset()`은 새 키도 지운다. `__lb.state()`에 `nickState` 추가.

### v3-7. 홈·순위표 탭
- 홈 순위 모달 탭 **7개**(카드 순서): 앵무새 · 똥비 · **붕어빵** · 두더지 · 개구리 · 뱀 · 블록. 폰에서 넘치면 탭 줄 가로 스크롤(art-ui).
- 붕어빵 탭: 탭 아래 **난이도 3칸 토글** 쉬움 · 보통 · 어려움(라디오, ←/→ 이동). 기본값 = `studio-lb-last`가 붕어빵 키면 그 난이도, 아니면 보통. 제목 "붕어빵 눈싸움 순위 · 보통". 점수 칸 "54.2%". 목록 위 작은 안내 "컴퓨터를 이긴 판의 내 땅 %".
- 붕어빵 게임 안 `[순위표]` → 그 판 난이도로 열고, 같은 토글로 다른 난이도도 볼 수 있음. `Leaderboard.open('bungeo-hard')`처럼 키로 연다.
- 빈 목록 문구는 그대로. 홈 처음 탭 규칙(마지막으로 플레이한 게임)은 그대로이며 붕어빵 키면 붕어빵 탭 + 해당 난이도.

`CONFIG.games`에 추가 (카드 순서상 poop-rain 다음):
```
bungeo-easy   : 붕어빵 눈싸움 · 쉬움,   tab '붕어빵', group 'bungeo', 표시 = score/10 소수 1자리 + '%', cap 1000, best = 0 (일괄 업로드 제외)
bungeo-normal : 붕어빵 눈싸움 · 보통,   (같음)
bungeo-hard   : 붕어빵 눈싸움 · 어려움, (같음)
```
- 같은 `group`은 탭 1개로 묶고 토글로 고른다. 순위 줄 칩·순위표·`my_rank` 모두 `fmt`를 게임별로(붕어빵만 % 형식).

### v3-8. 보안
- 표 3개(`players`, `devices`, `player_scores`) RLS 켜고 `anon`·`authenticated` 직접 접근 차단. 읽기·쓰기는 security definer 함수만.
- 공개 함수: `claim_nickname`, `rename_nickname`, `whoami`, `my_rank`, `top_scores`, `submit_score`. 내부 함수(`score_cap`, `lb_nick_*`)는 실행 권한 없음.
- 순위표·응답에 `player_id`·`device_id`·PIN 해시를 내보내지 않는다. 기기 번호가 사실상 열쇠(지금과 같음).
- PIN 시도 제한은 닉네임 계정 단위(기기 번호를 바꿔도 우회 불가). 틀린 PIN은 예외가 아니라 결과 행으로 돌려준다(예외면 실패 횟수 기록이 롤백됨).
- 한계(보고용): 4자리 PIN은 15분마다 5번 → 하루 최대 480번 시도 가능. 게임 순위용으로 충분하다고 판단. 서버 쪽 금칙어 검사는 없음(클라이언트만).

### v3-9. 기존 데이터 옮기기 (SQL 4번 블록)
- 옛 `scores`의 기기마다 **가장 최근 닉네임**을 그 기기의 이름으로 본다.
- 같은 닉네임(nick_key 기준)을 여러 기기가 썼으면 **가장 먼저 기록을 남긴 기기 1대**만 그 이름의 플레이어가 된다(PIN 없음). 그 기기의 옛 기록이 `player_scores`로 옮겨진다.
- 이름을 못 받은 기기·새 규칙에 안 맞는 닉네임의 기기: 옛 기록은 `scores`에 남는다 → 그 기기가 게이트에서 다른 이름으로 `created` 되면 서버가 그 기기 옛 기록을 옮기고, 클라이언트 일괄 업로드도 한 번 더 보낸다.
- 옮겨진(PIN 없는) 이름: 그 기기의 게이트에 옛 닉네임이 채워져 있고, PIN만 정하면 `same` → 기록 유지. 다른 이름으로 바꿔 등록해도(`created`) 같은 플레이어의 이름만 바뀌고 기록은 유지.
- 다른 기기에서 PIN 없는 이름을 입력하면 `taken`. 그 기기 주인이 돌아오지 않으면 이름은 계속 예약됨(범위 밖: 자동 해제).
- 재실행 안전: 이미 `devices`에 있는 기기·이미 있는 이름은 건너뛴다.

### v3-10. 추가 SQL (v1 + v2 위에 한 번 더 Run)
`docs/site/leaderboard-v3.sql`과 같은 내용. Supabase SQL Editor에 통째로 붙여넣고 Run. 기존 함수(`my_rank`, `top_scores`, `submit_score`, `score_cap`)는 **이름·인자·반환 형식이 같아** 옛 클라이언트(v1 모듈 캐시)도 읽기는 그대로 동작한다. 옛 클라이언트의 등록 안 된 기기 제출은 `no player`(400)로 거부 → 대기열에서 삭제됨.

```sql
-- 순위표 v3: 닉네임 계정(유일 닉네임 + 숫자 4자리 PIN) + 기록은 닉네임(플레이어) 단위 + 붕어빵 눈싸움 난이도별 순위
-- v1(leaderboard.sql 앞부분) + v2(score_cap, submit_score 검사) 위에 한 번 더 Run. 여러 번 Run해도 안전.
-- 로컬 Postgres에서 시험할 때: anon·authenticated 역할이 없으면 먼저
--   create role anon nologin; create role authenticated nologin;
-- (Supabase에는 이미 있으므로 여기서는 만들지 않는다)

-- 0. PIN 해시용 (Supabase는 이미 extensions 스키마에 설치되어 있어 아무 일도 안 함)
create extension if not exists pgcrypto;

-- 1. 표 ---------------------------------------------------------------
create table if not exists public.players (
  player_id    uuid        primary key default gen_random_uuid(),
  nickname     text        not null,
  nick_key     text        not null,                 -- 소문자, 공백·_·-·. 제거 (유일 판정용)
  pin_hash     text,                                  -- crypt(pin, gen_salt('bf')). null = 옛 기록에서 옮겨 와 아직 PIN을 안 정함
  pin_fails    integer     not null default 0,
  locked_until timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint players_nick_ok check (char_length(nickname) between 1 and 8),
  constraint players_key_ok  check (char_length(nick_key) between 1 and 8)
);
create unique index if not exists players_nick_key_uq on public.players (nick_key);

create table if not exists public.devices (
  device_id uuid        primary key,
  player_id uuid        not null references public.players (player_id) on delete cascade,
  linked_at timestamptz not null default now()
);
create index if not exists devices_player_idx on public.devices (player_id);

create table if not exists public.player_scores (
  game       text        not null,
  player_id  uuid        not null references public.players (player_id) on delete cascade,
  score      integer     not null,
  updated_at timestamptz not null default now(),   -- 지금 점수를 세운 시각 (같은 점수면 먼저 세운 사람이 위)
  primary key (game, player_id),
  constraint player_scores_score_ok check (score between 1 and 10000000)
);
create index if not exists player_scores_rank_idx on public.player_scores (game, score desc, updated_at asc, player_id);

alter table public.players       enable row level security;
alter table public.devices       enable row level security;
alter table public.player_scores enable row level security;
revoke all on public.players       from public, anon, authenticated;
revoke all on public.devices       from public, anon, authenticated;
revoke all on public.player_scores from public, anon, authenticated;

-- 2. 게임별 상한 (붕어빵 3개 추가: 이긴 판의 내 땅 %를 0.1% 단위 정수로, 100.0% = 1000)
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
    else null end;
$$;

-- 3. 닉네임 도우미 (내부용) -------------------------------------------
create or replace function public.lb_nick_clean(p text)
returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
$$;

create or replace function public.lb_nick_key(p text)
returns text language sql immutable set search_path = public as $$
  select lower(regexp_replace(coalesce(p, ''), '[[:space:]_.-]', '', 'g'));
$$;

create or replace function public.lb_nick_ok(p text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(
        char_length(p) between 1 and 8
    and p !~ '[[:cntrl:]@]'
    and p !~ '([0-9].*){5,}'
    and p ~ '^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9 _.-]+$'
    and public.lb_nick_key(p) <> '', false);
$$;

-- 4. 기존 기록 옮기기 (한 번만 실제로 동작, 다시 Run하면 건너뜀) ------------
-- 기기마다 가장 최근 닉네임을 그 기기의 이름으로 본다.
-- 같은 닉네임(nick_key)을 여러 기기가 썼으면 가장 먼저 기록을 남긴 기기 1대만 그 이름을 갖는다.
-- 나머지 기기의 옛 기록은 표에 남아 있다가, 그 기기가 새 닉네임으로 등록할 때 함께 옮겨진다(claim_nickname).
-- 옮겨진 플레이어는 PIN이 없다(pin_hash null). 그 기기에서 처음 닉네임 창을 통과할 때 PIN을 정한다.
do $$
declare
  r     record;
  v_pid uuid;
begin
  for r in
    select distinct on (c.k) c.device_id, c.nick, c.k
    from (
      select dv.device_id, dv.nick, public.lb_nick_key(dv.nick) as k,
             (select min(s2.updated_at) from public.scores s2 where s2.device_id = dv.device_id) as first_at
      from (
        select distinct on (s.device_id) s.device_id, public.lb_nick_clean(s.nickname) as nick
        from public.scores s
        order by s.device_id, s.updated_at desc
      ) dv
    ) c
    where public.lb_nick_ok(c.nick)
    order by c.k, c.first_at, c.device_id
  loop
    if exists (select 1 from public.devices d where d.device_id = r.device_id)
       or exists (select 1 from public.players p where p.nick_key = r.k) then
      continue;
    end if;
    insert into public.players (nickname, nick_key) values (r.nick, r.k)
      returning player_id into v_pid;
    insert into public.devices (device_id, player_id) values (r.device_id, v_pid);
    insert into public.player_scores (game, player_id, score, updated_at)
      select s.game, v_pid, s.score, s.updated_at
      from public.scores s
      where s.device_id = r.device_id
        and s.score between 1 and coalesce(public.score_cap(s.game), 0)
    on conflict (game, player_id) do nothing;
  end loop;
end $$;

-- 5. 닉네임 등록 / 이어받기 -------------------------------------------
-- status: created(새로 만듦) | same(이 기기의 내 닉네임, 옛 기록 기기는 이때 PIN을 정함)
--       | linked(다른 기기의 닉네임을 PIN으로 이어받음) | taken(다른 사람이 씀) | wrong_pin | locked
-- 형식이 틀리면 raise → HTTP 400. 틀린 PIN은 raise하지 않고 행으로 돌려준다(실패 횟수 기록이 롤백되지 않도록).
create or replace function public.claim_nickname(p_device uuid, p_nick text, p_pin text)
returns table(status text, nickname text, tries_left integer)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_column
declare
  v_nick text := public.lb_nick_clean(p_nick);
  v_key  text := public.lb_nick_key(public.lb_nick_clean(p_nick));
  v_pin  text := coalesce(p_pin, '');
  v_me   uuid;
  v_new  boolean;
  v_pid  uuid;
  pl     public.players%rowtype;
begin
  if p_device is null then
    raise exception 'missing value';
  end if;
  if not public.lb_nick_ok(v_nick) then
    raise exception 'bad nickname';
  end if;
  if v_pin !~ '^[0-9]{4}$' then
    raise exception 'bad pin';
  end if;

  select d.player_id into v_me from public.devices d where d.device_id = p_device;
  v_new := v_me is null;

  select * into pl from public.players p where p.nick_key = v_key for update;

  -- (가) 아무도 안 쓰는 이름
  if not found then
    begin
      -- 옛 기록에서 옮겨 온, 아직 PIN 없는 내 플레이어면 이름만 바꾸고 PIN을 정한다(기록 유지)
      if v_me is not null and exists (select 1 from public.players p where p.player_id = v_me and p.pin_hash is null) then
        update public.players p
           set nickname = v_nick, nick_key = v_key, pin_hash = crypt(v_pin, gen_salt('bf', 8)),
               pin_fails = 0, locked_until = null, updated_at = now()
         where p.player_id = v_me;
        return query select 'created'::text, v_nick, null::integer;
        return;
      end if;
      insert into public.players (nickname, nick_key, pin_hash)
        values (v_nick, v_key, crypt(v_pin, gen_salt('bf', 8)))
        returning player_id into v_pid;
      insert into public.devices (device_id, player_id) values (p_device, v_pid)
        on conflict (device_id) do update set player_id = excluded.player_id, linked_at = now();
    exception when unique_violation then
      return query select 'taken'::text, null::text, null::integer;
      return;
    end;
    -- 처음 등록하는 기기: 이 기기의 옛 기록(scores)을 새 플레이어로 옮긴다
    if v_new then
      insert into public.player_scores (game, player_id, score, updated_at)
        select s.game, v_pid, s.score, s.updated_at
        from public.scores s
        where s.device_id = p_device
          and s.score between 1 and coalesce(public.score_cap(s.game), 0)
      on conflict (game, player_id) do nothing;
    end if;
    return query select 'created'::text, v_nick, null::integer;
    return;
  end if;

  -- (나) 이미 있는 이름, PIN 없음(옛 기록에서 옮겨 온 이름)
  if pl.pin_hash is null then
    if pl.player_id = v_me then
      update public.players p
         set pin_hash = crypt(v_pin, gen_salt('bf', 8)), pin_fails = 0, locked_until = null, updated_at = now()
       where p.player_id = pl.player_id;
      return query select 'same'::text, pl.nickname, null::integer;
      return;
    end if;
    return query select 'taken'::text, null::text, null::integer;
    return;
  end if;

  -- (다) 이미 있는 이름, PIN 확인
  if pl.locked_until is not null and pl.locked_until > now() then
    return query select 'locked'::text, null::text, 0;
    return;
  end if;

  if pl.pin_hash = crypt(v_pin, pl.pin_hash) then
    update public.players p set pin_fails = 0, locked_until = null where p.player_id = pl.player_id;
    insert into public.devices (device_id, player_id) values (p_device, pl.player_id)
      on conflict (device_id) do update set player_id = excluded.player_id, linked_at = now();
    return query select (case when pl.player_id = v_me then 'same' else 'linked' end)::text, pl.nickname, null::integer;
    return;
  end if;

  -- 틀린 PIN: 5번 틀리면 15분 잠금
  if pl.pin_fails + 1 >= 5 then
    update public.players p
       set pin_fails = 0, locked_until = now() + interval '15 minutes'
     where p.player_id = pl.player_id;
    return query select 'locked'::text, null::text, 0;
    return;
  end if;
  update public.players p set pin_fails = pl.pin_fails + 1 where p.player_id = pl.player_id;
  return query select 'wrong_pin'::text, null::text, 5 - (pl.pin_fails + 1);
end;
$$;

-- 6. 이름 바꾸기 (기록·PIN 유지) ---------------------------------------
-- status: ok | taken. 이 기기가 등록 안 됐거나 PIN이 없으면 raise(400).
create or replace function public.rename_nickname(p_device uuid, p_nick text)
returns table(status text, nickname text)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_nick text := public.lb_nick_clean(p_nick);
  v_key  text := public.lb_nick_key(public.lb_nick_clean(p_nick));
  v_pid  uuid;
begin
  if p_device is null then
    raise exception 'missing value';
  end if;
  if not public.lb_nick_ok(v_nick) then
    raise exception 'bad nickname';
  end if;
  select d.player_id into v_pid
    from public.devices d join public.players p on p.player_id = d.player_id
   where d.device_id = p_device and p.pin_hash is not null;
  if v_pid is null then
    raise exception 'no player';
  end if;
  if exists (select 1 from public.players p where p.nick_key = v_key and p.player_id <> v_pid) then
    return query select 'taken'::text, null::text;
    return;
  end if;
  begin
    update public.players p set nickname = v_nick, nick_key = v_key, updated_at = now() where p.player_id = v_pid;
  exception when unique_violation then
    return query select 'taken'::text, null::text;
    return;
  end;
  return query select 'ok'::text, v_nick;
end;
$$;

-- 7. 이 기기의 닉네임 확인 (읽기 전용, 다른 기기에서 이름을 바꿨을 때 맞추기용) --
create or replace function public.whoami(p_device uuid)
returns table(nickname text, has_pin boolean)
language sql stable security definer set search_path = public as $$
  select p.nickname, p.pin_hash is not null
  from public.devices d join public.players p on p.player_id = d.player_id
  where d.device_id = p_device;
$$;

-- 8. 순위 함수 교체 (이름·인자·반환 형식 그대로, 플레이어 단위로 읽음) ------
create or replace function public.my_rank(p_game text, p_device uuid)
returns table(rank bigint, total bigint, best integer, nickname text)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.player_scores o
      where o.game = s.game
        and (o.score > s.score
             or (o.score = s.score
                 and (o.updated_at < s.updated_at
                      or (o.updated_at = s.updated_at and o.player_id < s.player_id))))) + 1,
    (select count(*) from public.player_scores t where t.game = s.game),
    s.score,
    p.nickname
  from public.devices d
  join public.player_scores s on s.player_id = d.player_id and s.game = p_game
  join public.players p on p.player_id = s.player_id
  where d.device_id = p_device;
$$;

create or replace function public.top_scores(p_game text, p_limit integer default 20, p_device uuid default null)
returns table(rank bigint, nickname text, score integer, is_me boolean)
language sql stable security definer set search_path = public as $$
  select
    row_number() over (order by s.score desc, s.updated_at asc, s.player_id asc),
    p.nickname,
    s.score,
    coalesce(s.player_id = (select d.player_id from public.devices d where d.device_id = p_device), false)
  from public.player_scores s
  join public.players p on p.player_id = s.player_id
  where s.game = p_game
  order by s.score desc, s.updated_at asc, s.player_id asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- 기록 등록: 기기 → 플레이어로 바꿔 플레이어의 최고 기록만 갱신. p_nick은 호환용(무시, 이름은 players에서).
create or replace function public.submit_score(p_game text, p_device uuid, p_nick text, p_score integer)
returns table(rank bigint, total bigint, best integer, nickname text)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_cap integer := public.score_cap(p_game);
  v_pid uuid;
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
  select d.player_id into v_pid from public.devices d where d.device_id = p_device;
  if v_pid is null then
    raise exception 'no player';
  end if;

  insert into public.player_scores as s (game, player_id, score)
  values (p_game, v_pid, p_score)
  on conflict (game, player_id) do update
    set score      = greatest(s.score, excluded.score),
        updated_at = case when excluded.score > s.score then now() else s.updated_at end;

  return query select * from public.my_rank(p_game, p_device);
end;
$$;

-- 9. 권한 -------------------------------------------------------------
revoke all on function public.score_cap(text)     from public, anon, authenticated;
revoke all on function public.lb_nick_clean(text) from public, anon, authenticated;
revoke all on function public.lb_nick_key(text)   from public, anon, authenticated;
revoke all on function public.lb_nick_ok(text)    from public, anon, authenticated;

revoke all on function public.claim_nickname(uuid, text, text)           from public;
revoke all on function public.rename_nickname(uuid, text)                from public;
revoke all on function public.whoami(uuid)                               from public;
revoke all on function public.my_rank(text, uuid)                        from public;
revoke all on function public.top_scores(text, integer, uuid)            from public;
revoke all on function public.submit_score(text, uuid, text, integer)    from public;
grant execute on function public.claim_nickname(uuid, text, text)        to anon, authenticated;
grant execute on function public.rename_nickname(uuid, text)             to anon, authenticated;
grant execute on function public.whoami(uuid)                            to anon, authenticated;
grant execute on function public.my_rank(text, uuid)                     to anon, authenticated;
grant execute on function public.top_scores(text, integer, uuid)         to anon, authenticated;
grant execute on function public.submit_score(text, uuid, text, integer) to anon, authenticated;
```

SQL 확인 쿼리(로컬 검증용, 실서버에서는 읽기만):
```sql
select public.score_cap('bungeo-hard');                       -- 1000
select public.lb_nick_key(' Kong_7 ');                        -- kong7
select public.lb_nick_ok('콩이'), public.lb_nick_ok('__'), public.lb_nick_ok('a@b');  -- t, f, f
-- 로컬에서만: 등록 → 이어받기 → 틀린 PIN 5번 → 잠금
select * from public.claim_nickname('00000000-0000-4000-8000-000000000001', '콩이', '1234');   -- created
select * from public.claim_nickname('00000000-0000-4000-8000-000000000002', 'KONG 이', '1234'); -- created (키 kong이, 콩이와 다름)
select * from public.claim_nickname('00000000-0000-4000-8000-000000000002', '콩 이', '0000');   -- wrong_pin, tries_left 4
select * from public.claim_nickname('00000000-0000-4000-8000-000000000002', '콩이', '1234');    -- linked, 콩이
select * from public.submit_score('bungeo-normal', '00000000-0000-4000-8000-000000000002', 'x', 542);  -- rank 1, best 542, 콩이
select * from public.my_rank('bungeo-normal', '00000000-0000-4000-8000-000000000001');               -- 같은 플레이어 → 같은 줄
select * from public.submit_score('bungeo-normal', '00000000-0000-4000-8000-000000000002', 'x', 1001); -- error bad score
```

### v3-11. 개발자 작업 목록
`lib/leaderboard.js` (v2 → `version: 2`, 모든 페이지 `?v=2`)
1. CONFIG: 붕어빵 3개 키 추가(`group`, `tab`, `fmt`, `cap 1000`, `best` = 0). 칩·순위표·접근성 문구의 점수 표시를 게임별 `fmt`로.
2. 게이트(v3-4): 로드 시 상태 확인 → 게이트 열기. 닫기 수단 없음, `isOpen()` true. `claim_nickname` 결과별 처리·문구. pending 처리(결정 3). 클라이언트 닉네임 검사에 "한글·영문·숫자 1글자 이상" 추가, PIN 검사.
3. `report()`: `nonick` 상태 삭제. pending이면 대기열 + "연결되면…". `sent[game]` 없을 때 이번 판 점수만. 붕어빵 `none` 문구 "이기면 순위에 올라가요".
4. `flush()`: `studio-nick-state`가 `ok`일 때만 전송, pending이면 claim 재시도 먼저. `submit_score` 400 `no player` → 상태를 지우고 다음 로드에 게이트.
5. 일괄 업로드: `created`/`same`이고 `studio-lb-seeded` 없을 때만, 6개 게임만.
6. 로드 시 `whoami`(v3-5).
7. 순위표 아래 줄: `[이름 바꾸기]`(rename_nickname 창), `[다른 닉네임으로]`(닫을 수 있는 게이트, 먼저 flush, 성공 시 sent·대기열 비움). 기존 닉네임 시트는 이름 바꾸기 창으로 바꿈.
8. 홈 탭 7개 + 붕어빵 난이도 토글(v3-7).
9. `__lb`: `reset()`이 새 키 삭제, `state()`에 `nickState`. 게이트를 테스트에서 건너뛰려면 `studio-nickname`·`studio-nick-state='ok'`를 미리 넣는다.

`games/bungeo-snowfight/index.html`
10. `<script src="../../lib/leaderboard.js?v=2" defer></script>` 추가. 결과 오버레이 `#resRec` 아래·버튼 줄 위에 `<div id="lbSlot">`(min-height 32px, 기존 결과 화면 레이아웃 원칙). 2인 대전이면 숨김.
11. `showResult()`: v3-3 표대로 `report` 호출. 로컬 최고는 이긴 판만 갱신(결정 6).
12. `S.tainted` + 훅 10개에서 true(v3-3).
13. keydown 핸들러 맨 앞, `onPointerDown` 맨 앞에 `if (window.Leaderboard && Leaderboard.isOpen()) return;`.

기타
14. 다른 6개 게임·홈: `?v=1` → `?v=2`만.
15. `tests/smoke.js`: 모든 페이지 `addInitScript`로 `studio-nickname='테스트'`, `studio-nick-state='ok'`, `studio-device-id`(UUID) 미리 넣기(아니면 게이트에 막힘). supabase abort는 그대로. 붕어빵 페이지 포함 전체 통과.
16. `docs/site/leaderboard.sql` 끝에 v3 내용 붙이기(v2 때와 같은 방식).

### v3-12. QA 검증 항목 (실서버 쓰기 금지 — 모킹, SQL은 로컬 Postgres)
SQL (로컬 Postgres, v1 → v2 → v3 순서로 실행)
1. v3를 **두 번** 실행해도 오류 없음, 옮긴 데이터 중복 없음.
2. 옮기기: 서로 다른 기기 3대 중 2대가 같은 닉네임(`콩이`, `콩 이`) → 먼저 기록한 기기만 플레이어, 기록 이동. 나머지 기기 옛 기록은 `scores`에 남음 → 그 기기가 새 이름으로 `created` → 옛 기록이 `player_scores`로.
3. `claim_nickname`: created / 대소문자·공백·`_-.`만 다른 이름 → wrong_pin 또는 taken / 맞는 PIN → linked / 같은 기기 → same / 틀린 PIN 4번 tries_left 4→1, 5번째 locked, 잠금 중 맞는 PIN도 locked, `locked_until`을 과거로 바꾸면 다시 가능 / PIN 없는 옮긴 이름: 그 기기 → same(PIN 저장), 다른 기기 → taken / `bad nickname`(`__`, `a@b`, `0101234567`, 9자), `bad pin`(`123`, `12a4`, null) → 예외.
4. `pin_hash`가 `$2a$`로 시작하는 해시(평문 아님).
5. 다른 기기 2대가 같은 플레이어 → `top_scores`에 1줄, 두 기기 모두 `is_me = true`, `my_rank` 같음. 낮은 점수 제출은 점수·`updated_at` 그대로.
6. `submit_score`: 등록 안 된 기기 → no player, 붕어빵 1001 → bad score, 1000 → 통과, 없는 게임 → bad game.
7. `rename_nickname`: ok / 남이 쓰는 이름 → taken / 대소문자만 바꾸기 → ok / PIN 없는 플레이어 → 예외.
8. 권한: `set role anon;`으로 표 3개 `select` → permission denied, `lb_nick_ok`·`score_cap` 실행 → permission denied, 공개 함수 6개 실행 → 가능.

클라이언트 (모킹)
9. 깨끗한 상태로 홈·각 게임 직접 접속 → 게이트가 바로 뜸, Esc·바깥 탭·Space/Enter로 닫히거나 게임이 시작되지 않음. 형식이 맞을 때만 [시작하기] 활성.
10. 상태별 문구(v3-4 표) 모두 확인. `wrong_pin`이면 PIN 칸만 비움.
11. `created` → 6개 게임 로컬 최고 일괄 제출, **붕어빵 키는 제출 없음**, `studio-lb-seeded=1`. `linked` → 일괄 제출 없음, sent 비움.
12. 새로 고침 → 게이트 안 뜸(같은 닉네임 유지), `whoami` 1회. `whoami`가 다른 이름 → 닉네임 갱신. 빈 배열 → 게이트(이름 채움). `has_pin:false` → 게이트(PIN 정하기 문구).
13. 서버 불통(abort/500)에서 [시작하기] → 게임 가능, `nick-state=pending`, 결과 화면 "연결되면 순위에 올라가요". 연결 복구 후 새로 고침 → claim → submit 순서. 재시도 결과 taken → 다음 로드에 게이트(문구). `studio-pin-pending`은 성공 후 삭제됨.
14. `lib/leaderboard.js` abort → 게이트 없이 8개 페이지 모두 정상 플레이.
15. 붕어빵: 컴퓨터 대전 이김(54.2%) → `submit_score {p_game:'bungeo-normal', p_score:542}` 1회 + 칩 순위. 짐·비김 → submit 없음, `my_rank`만, 순위 없으면 "이기면 순위에 올라가요". 2인 대전 → rpc 0회·슬롯 숨김. `__bungeo` 훅을 쓴 판 → "테스트 판은…". 로컬 "최고 %"는 진 판에서 안 바뀌고 이긴 판에서만 갱신(기존 값은 유지).
16. 홈 탭 7개, 붕어빵 탭 토글 3칸(쉬움/보통/어려움, ←/→), 점수 "54.2%", 기본 난이도 규칙. 붕어빵 결과 화면 [순위표] → 그 난이도로 열림.
17. 순위표 [이름 바꾸기] ok/taken, [다른 닉네임으로] linked 후 sent·대기열 비움.
18. 레이아웃: 게이트 창이 iPad 세로·가로, 폰 가로 844×390·667×375에서 키보드가 올라와도 두 칸과 [시작하기]가 보임. 붕어빵 결과 화면 순위 줄이 "다시 하기"와 겹치지 않음.
19. 회귀: `node tests/smoke.js`(시드 넣은 버전) 전체 통과, 콘솔 오류 0.

### v3-13. CEO 결정·구현 확정 (2026-11-15, 위 v3 절보다 우선)
1. **PIN 보기 없음.** 서버는 PIN 해시만 저장하고, 기기에도 PIN 평문을 저장하지 않는다(예외: 서버 불통 임시 등록 동안의 `studio-pin-pending`, 재시도 결과가 나오면 즉시 삭제). 내 정보 시트 = 닉네임 · [닉네임 바꾸기](`rename_nickname`) · [PIN 바꾸기](`change_pin`) · [다른 닉네임으로 이어하기] · 안내 "PIN은 다른 기기에서 이어할 때 필요해요. 잊지 않게 적어 두세요". 홈 제목 줄 닉네임 버튼과 순위표 아래 "닉네임: ○○ · [내 정보]"가 이 시트를 연다.
2. **PIN 바꾸기 추가**(SQL `change_pin(p_device, p_old, p_new)` → `[{status:'ok'|'wrong_pin'|'locked', tries_left}]`, 틀린 PIN·잠금 규칙은 claim과 같음, PIN 없는 옛 플레이어는 p_old 무시).
3. **게이트 흐름**은 UI 명세(leaderboard-ui.md v2 1장)대로 닉네임 → PIN 정하기 → PIN 한 번 더 → `claim_nickname`. 결과가 `wrong_pin`이면 "이미 쓰는 닉네임이에요 — 내 닉네임이면 PIN을 입력하세요" 단계([PIN 입력하기] / [다른 닉네임 쓰기]).
4. **로드 시 `whoami`는 상태가 없을 때도 호출**: 게이트를 띄운 채 확인해, PIN 없는 옛 플레이어(`has_pin=false`)면 바로 "PIN 정하기" 단계(옛 닉네임 채움, [← 닉네임 바꾸기] 가능), PIN 있는 등록 기기면 상태를 되살리고 게이트를 닫는다. `ok` 상태에서 `has_pin=false`여도 같은 단계.
5. **기록 초기화(사용자 요청 "지금까지 기록된게 있으면 그냥 삭제해줘")**: 배포 때 `docs/site/leaderboard-reset.sql` → v3 순서로 실행해 서버 기록을 모두 지우고 시작한다. 그래서
   - **로컬 최고 일괄 업로드(v3-4)를 끈다**(`CONFIG.seedLocalBest = false`). 켜 두면 지운 기록이 기기에서 다시 올라온다. 등록 뒤에는 그 게임에서 서버 최고보다 높은 **이번 판 점수만** 자동 제출된다. `studio-lb-seeded`는 그대로 '1'로 기록.
   - v1/v2 시절 기기(옛 `studio-nickname`·`studio-lb-sent`·대기열이 있고 서버 `whoami`가 빈 배열)는 **새 방문자**로 본다: 게이트에 옛 닉네임을 채워 띄우고(바꿀 수 있음), 옛 `studio-lb-sent`·`studio-lb-queue`를 지운다. 상태가 없는 기기는 로드 때 바로 지우고, `ok` 상태인데 `whoami`가 빈 배열이면 그때 지운다(대기열은 `whoami` 확인 뒤에 보낸다).
   - PIN 없는 옛 플레이어 경로(4번)는 다른 설치·재마이그레이션을 위해 남겨 둔다(실서버에서는 쓰이지 않음).
6. 임시 등록 재시도가 taken 등으로 끝나 다음 로드에 게이트를 다시 여는 경우의 대기열은 지우지 않는다(같은 사람이 친 판, v3-2 결정 3).
7. 잠금 남은 시간: 서버가 주지 않으므로 이 기기에서 잠금을 받은 시각 + 15분(`studio-lb-lock`, 닉네임 키별)으로 카운트다운.
8. `docs/site/leaderboard.sql` 끝에 v3를 붙이는 작업(v3-11 16번)은 하지 않았다(SQL 파일 수정 금지 지시). v3 SQL은 `docs/site/leaderboard-v3.sql`에만 있다.

## 범위 밖
- ~~로그인·계정~~(v3: 닉네임+PIN 계정 도입). 이메일·소셜 로그인, **PIN 재설정**(잊은 PIN 찾기), PIN 보기, 계정 삭제, 기기 연결 해제, 오래 안 쓴 이름 자동 해제
- 기록 삭제·신고·관리자 화면, 서버 측 재생 검증(리플레이), 요청 횟수 제한(PIN 잠금 제외), 서버 쪽 금칙어 검사
- 주간/일간 순위, 친구 순위, 붕어빵 승률·판수 순위, 2인 대전 순위
- 게임 내 시작 화면에 순위 표시(결과 화면·홈에서만)

## 변경 이력
- 2026-11-15 최초 기획 (Supabase, 닉네임 8자, 공통 모듈 `lib/leaderboard.js`, 게임별 상한 SQL)
- 2026-11-15 v3: 첫 방문 닉네임 게이트(건너뛰기 없음, 서버 불통 시 임시 등록), 유일 닉네임 + 숫자 4자리 PIN 이어받기(bcrypt 해시, 5회 실패 15분 잠금), 기록을 기기 → 플레이어 단위로(`players`·`devices`·`player_scores`, 옛 `scores` 옮기기), 붕어빵 눈싸움 난이도별 순위(이긴 판의 내 땅 %, 0.1% 단위 정수, 상한 1000), 붕어빵 로컬 최고는 이긴 판만 갱신·일괄 업로드 제외, 홈 탭 7개 + 붕어빵 난이도 토글. SQL `docs/site/leaderboard-v3.sql`
- 2026-11-15 v3 확정(v3-13): PIN 보기 제거, PIN 바꾸기(`change_pin`) 추가, 내 정보 시트. **사용자 요청으로 기존 기록 전부 삭제** — 배포 때 `leaderboard-reset.sql` → v3 실행, 로컬 최고 일괄 업로드 끔, v1/v2 기기는 새 방문자로(옛 닉네임만 채워 주고 sent·대기열 삭제)
