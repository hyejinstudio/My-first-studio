# 사이트 공통 온라인 순위표 기획서
- slug: (사이트 공통) — 모듈 `lib/leaderboard.js`
- 한 줄 소개: 게임이 끝나면 내 기록이 온라인 순위표에 올라가고, "내 순위 N위 · M명"과 상위 20명을 볼 수 있다.
- 사용자 요청 원문: "방문한 사람들의 기록이 남았으면 좋겠어. 최고기록 등을 기록해서 순위도 매기고 나는 몇등인지도 확인가능하게"
- 백엔드: Supabase (사용자가 프로젝트 생성·`docs/site/leaderboard.sql` 실행 완료). 이 문서의 "추가 SQL"은 **한 번 더 실행**해야 한다.

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

## 범위 밖
- 로그인·계정, 기기 간 기록 합치기, 닉네임 중복 방지(같은 닉네임 허용)
- 기록 삭제·신고·관리자 화면, 서버 측 재생 검증(리플레이), 요청 횟수 제한
- 주간/일간 순위, 친구 순위, 붕어빵 눈싸움 순위(승패제)
- 게임 내 시작 화면에 순위 표시(결과 화면·홈에서만)

## 변경 이력
- 2026-11-15 최초 기획 (Supabase, 닉네임 8자, 공통 모듈 `lib/leaderboard.js`, 게임별 상한 SQL)
