# 사이트 공통 온라인 순위표 QA 리포트

## 2026-11-15 QA — v3: 닉네임 게이트 + 4자리 PIN + 플레이어 단위 기록 + 붕어빵 순위 (커밋 7e529ea)
판정: **통과 (조건부)** — 치명·높음 버그 없음. 단, **v3 SQL을 서버에 먼저 적용한 뒤 배포**해야 한다(아래 [보통] 1번: 순서가 바뀌면 새 방문자 전원이 게이트에서 막힘). 낮음 2건은 출시를 막지 않음.

대상: `lib/leaderboard.js`(v2), `games/bungeo-snowfight/index.html` 통합, 다른 6개 게임 `?v=2`, `index.html` 닉네임 버튼, `tests/smoke.js`, SQL `docs/site/leaderboard-v3.sql`(+`change_pin`) / `leaderboard-reset.sql`.
환경: Playwright + Chromium(헤드리스), iPad·폰은 기기 에뮬레이션. 서버는 `page.route`로 v3 함수(claim/whoami/rename/change_pin/submit/my_rank/top_scores)를 흉내 낸 메모리 모킹. **실서버 쓰기 0회**, 실서버 읽기는 `top_scores` 1회만. SQL은 로컬 Postgres 16에서 독립 검증 후 DB 삭제.
테스트 스크립트(저장소 밖): `/tmp/claude-0/-home-user-My-first-studio/badfc8a9-5b8e-56e1-ae5b-fb1679c195bf/scratchpad/qa3/` (h.js, gate.js, legacy.js, submit.js, bungeo.js, home.js, layout.js, regress.js, extra.js)
스크린샷: `/tmp/claude-0/-home-user-My-first-studio/badfc8a9-5b8e-56e1-ae5b-fb1679c195bf/scratchpad/qa3lb-*.png` (88장, deviceScaleFactor 1)

### 실행한 테스트와 결과

**SQL (로컬 Postgres 16, UTF8, 역할 anon/authenticated, `extensions` 스키마에 pgcrypto)** — v3-12 항목 1~8 전부 통과
- 실행 순서 3가지 모두 오류 없음: ① v1 → v2 → 옛 데이터 → v3 → v3(재실행) → v3(3회째) ② v1 → v2 → 데이터 → **reset → v3 → v3 → reset → v3** ③ v1(v2 없이) → 데이터 → reset → v3. reset은 v3 표가 없을 때도 동작.
- 옮기기(①): `콩이`(기기 a1, 먼저 기록)·`콩 이`(a2) → a1만 플레이어(PIN 없음), 기록 이동. a2 옛 기록은 `scores`에 남음 → a2가 `콩콩`으로 `created` → poop 300이 `player_scores`로 이동. 옛 닉네임 `__`(새 규칙 위반) 기기도 새 이름 `created` 때 기록 이동. 상한 초과(snake 5000 > 4000)는 옮기지 않음. 재실행 후 플레이어·기록 중복 없음.
- reset(②): 4개 표 모두 0행. 이후 v3 재실행해도 0행 유지.
- `claim_nickname`: created / same / `kong 7`·`KONG-7.`·`K.o.n.g7`(대소문자·공백·`_-.` 차이) → wrong_pin, tries_left 4→3→2→1, 5번째 locked, 잠금 중 맞는 PIN도 locked, `locked_until` 과거로 → linked / 연결된 기기에서 다시 → same / PIN 없는 옮긴 이름: 다른 기기 → taken, 그 기기에서 빈 이름으로 → created(이름만 바뀌고 기록 유지) / 예외: `__`, `a@b`, `0101234567`, 9자, `<b>x` → bad nickname, `123`·`12a4`·null → bad pin, 기기 null → missing value. `  가  나 ` → `가 나`로 정리.
- `pin_hash`: `$2a$08$…` 60자 bcrypt(평문 아님).
- 같은 플레이어 기기 2대: `top_scores` 1줄, 두 기기 모두 `is_me=true`, `my_rank` 같음. 낮은 점수 제출 → 점수·`updated_at` 그대로.
- `submit_score`: 미등록 기기 → no player, 붕어빵 1001 → bad score, 1000 통과, 542·6 통과, 0 → bad score, 없는 게임 → bad game, poop 50001 → bad score. `p_nick`은 무시(이름은 players).
- `rename_nickname`: ok / 남의 이름(`토 끼`) → taken / 자기 이름 대소문자·공백만 → ok / 미등록 기기 → no player / PIN 없는 플레이어 → no player / `a@b` → bad nickname. 다른 기기 `whoami`에 새 이름 반영.
- `change_pin`: 틀린 지금 PIN → wrong_pin 4…1, 5번째 locked, 잠금 중 맞는 PIN도 locked(claim도 locked), 잠금 해제 후 ok. 바꾼 뒤 옛 PIN으로 claim → wrong_pin, 새 PIN → linked. 새 PIN `12x4`/null → bad pin, 미등록 기기 → no player, PIN 없는 플레이어는 p_old 무시하고 ok.
- 권한: `set role anon`/`authenticated`로 `players`·`devices`·`player_scores`·`scores` select/insert → permission denied. `lb_nick_ok`·`lb_nick_key`·`lb_nick_clean`·`score_cap` 실행 → permission denied. 공개 함수 7개(claim, rename, whoami, change_pin, my_rank, top_scores, submit_score) anon 실행 가능(proacl 확인). `top_scores` limit 1000 → 최대 50으로 제한.

**클라이언트 (모킹)**
1. 회귀 스모크 `node tests/smoke.js` — 7개 게임 × PC / iPad 세로 / iPad 가로 + 게이트 검사 **전부 통과**.
2. 첫 방문 게이트(gate.js, 207항목 중 206 통과, 실패 1건은 테스트 모킹 실수로 재확인 결과 정상) — 홈 + 게임 7개 × PC·iPad(터치):
   - 로드 즉시 게이트, `isOpen()` true, `whoami` 1회. X 버튼 없음. Esc·Enter·Space·P·M·방향키(포커스 없앤 뒤)·바깥 탭·[시작하기] 위치 탭 → 게이트 유지, 게임 시작 화면 그대로(붕어빵 `phase=menu`). 통과 후에도 게임은 시작 화면에 머묾. 홈은 제목 줄에 닉네임 버튼 표시. 콘솔 오류 0.
   - 닉네임 규칙: 빈 값·공백만 → [다음] 비활성. 거부 `__`·`._-`·`<b>`·`hi!`·`😀`(형식), `a@b`·`01012345`·`www.kr`(개인정보), `시발`·`ADMIN`(금칙어). 9자 → 8자에서 멈춤, `8/8`. ` 콩  이 ` → `콩 이`. 한글 IME 조합 중 Enter 무시.
   - PIN: `inputmode=numeric`, `maxlength 4`, `type=text`, `autocomplete=off`. `1a2b` → `12`. 정하기 단계는 마지막 숫자를 1초 보였다가 ●. 이어받기 단계는 바로 ●, [보기] `aria-pressed`. 4자리 전 [다음] 비활성. 한 번 더 단계 불일치 → "PIN이 서로 달라요. 다시 정해 주세요" → 0.8초 뒤 PIN 정하기(빈 칸), claim 호출 없음. 버튼 [시작하기].
   - 이미 있는 이름에 새 PIN → wrong_pin → "이미 쓰는 닉네임이에요 / 내 닉네임이면 PIN을 입력하세요 (남은 기회 4번)" + [다른 닉네임 쓰기]·[PIN 입력하기]. 틀림 → PIN 칸 비움·흔들림·"남은 기회 3번", 1번 남으면 "마지막 기회예요". 5번째 → "PIN을 여러 번 틀렸어요. 15:00 뒤에…" 1초마다 줄어듦, PIN·[이어서 하기] 비활성, [다른 닉네임 쓰기]는 가능. `studio-lb-lock`에 닉네임 키별 저장(새로 고침해도 유지). 끝나면 문구 원복·칸 활성. 맞는 PIN → linked, 서버 표기(`콩이`)로 저장, 일괄 업로드 없음, 잠금 기록 삭제.
   - taken(PIN 없는 옛 이름) → 닉네임 단계 + "이미 쓰는 닉네임이에요. 다른 이름을 써 주세요"(빨간 테두리). HTTP 400 bad nickname → "8자 이내…", bad pin → PIN 정하기 + "PIN은 숫자 4자리예요". created → `nick-state=ok`, `seeded=1`, **submit 0회**(로컬 최고 777/300/1200, 붕어빵 70.5% 있었음). claim 바디 `{p_device,p_nick,p_pin}`.
   - 새로 고침 → 게이트 없음, whoami +1. 다른 기기에서 이름 변경 → 닉네임 갱신. `has_pin:false` → "PIN 정하기"(옛 닉네임, "전에 쓰던 닉네임이에요…", [← 닉네임 바꾸기]) → same. 상태 없음 + 서버가 아는 기기(PIN 있음) → 게이트 자동 닫힘·상태 복구. 상태 없음 + PIN 없는 옛 플레이어 → 바로 PIN 정하기.
3. 초기화 후 옛 기기(legacy.js, 58/58) — v1 localStorage(`studio-nickname=콩이`, sent, queue, device id), whoami `[]`:
   - 홈·게임 모두 게이트에 `콩이` 채움 + "전에 쓰던 닉네임이에요. 그대로 쓰거나 바꾼 뒤…", `studio-lb-sent`·`studio-lb-queue` 즉시 삭제, 호출은 whoami뿐. 등록 후 submit 0회(일괄 업로드 없음), 로컬 최고 키는 보존.
   - `nick-state=ok`였던 기기 + whoami `[]` → 그때 sent·queue·state 삭제, 게이트(이름 채움), submit 0.
4. 오프라인 임시 등록(legacy.js) — abort / 500 / 응답 없음(6.0초 타임아웃) 세 경우 모두: 게이트 닫힘, `nick-state=pending`, `studio-pin-pending` 보관 → 게임 정상, 결과 칩 "연결되면 순위에 올라가요", 대기열 저장. 내 정보 시트: [닉네임 바꾸기]·[PIN 바꾸기] 비활성 + "연결되면 바꿀 수 있어요". 복구 후 `online` 이벤트/새로 고침 → **claim → submit 순서**, `pin-pending` 삭제, 대기열 비움, 칩이 순위로 바뀜.
   - 재시도 결과 taken / wrong_pin / locked: 그 페이지에서는 게이트 안 뜸, `pin-pending`·state 삭제, 대기열 유지, submit 0. 다음 로드에 각각 "이미 쓰는 닉네임이에요"(이름 채움) / "이미 쓰는 닉네임" 단계(남은 기회 4번) / PIN 입력 단계 + 카운트다운. 새 이름으로 등록하면 남은 대기열이 새 플레이어로 제출됨.
5. 자동 기록·다른 기기 공유(submit.js) — 기기 A 첫 판(27점) → submit 1회(이번 판 점수만, 로컬 최고 999는 안 보냄), 바디 `{p_game,p_device,p_nick,p_score}`. 낮은 판 → my_rank만. 높은 판 → submit 1회. 기기 B가 PIN으로 이어받기(linked) → 홈 순위표에 `공유` 1줄(나 표시). B의 낮은 판도 서버 최고 유지(아래 [낮음] 2번 배지 문제). 이름 변경은 A 새로 고침 때 whoami로 반영.
6. 내 정보 시트 — 닉네임·[닉네임 바꾸기]·[PIN 바꾸기]·[다른 닉네임으로 이어하기]·PIN 안내, "PIN 보기" 없음. 이름 바꾸기 taken/ok("닉네임을 바꿨어요"). PIN 바꾸기: 틀린 지금 PIN → 지금 PIN 단계 + "남은 기회 4번", 새 PIN 불일치 → 새 PIN 단계로, 성공 "PIN을 바꿨어요", 바디 `{p_device,p_old,p_new}`. 다른 닉네임으로: 닫기 가능(X·Esc), **대기열 flush → claim** 순서, 성공 후 sent·대기열 비움. 기존 이름 + 맞는 PIN → linked. 홈 닉네임 버튼·순위표 "내 정보" 둘 다 시트를 엶, Esc는 시트만 닫음, 바깥 클릭 닫힘. rename/submit에서 `no player` → 게이트(닉네임 채움, 닫기 없음).
   - **PIN 평문 저장 없음**: 등록·이어받기·PIN 변경 뒤 localStorage 전체에 PIN 값 없음. 예외 `studio-pin-pending`은 임시 등록 중에만 있고 결과(성공·taken·wrong_pin·locked) 뒤 삭제 확인.
7. 붕어빵(bungeo.js, 37/37)
   - 실제 판(보통, 아무 조작 없이 60초) → 패배 15.6% : 61.9% → submit 0, my_rank만, 칩 "이기면 순위에 올라가요", 로컬 최고·승리 수 변화 없음. 판 중 M(음소거)·P(일시정지/재개), 결과 후 Enter 다시 하기 정상.
   - `__bungeo` 훅으로 이긴 판 → "테스트 판은 순위에 안 올라가요", submit 0. (`__lb.allowTainted(true)`로) 이김 87칸 54.4% → `submit_score {bungeo-normal, 544}` 1회, 칩 순위, 로컬 최고 54.4 + "새 기록!". 진 판(37.5%) → my_rank만, 칩 "내 순위…", 로컬 최고 그대로. 서버 최고보다 낮은 이긴 판(51.3%) → 제출 없음, 로컬 최고 그대로. 비김 50:50 → 제출 없음, "이기면 순위에 올라가요". 쉬움에서 62.5%로 이김(기존 로컬 70.5%) → 서버에는 625 제출, 로컬 70.5 유지. 160칸 → 1000. 2인 대전 → rpc 0, `#resRecRow` 숨김. 다시 컴퓨터 대전 → 슬롯 다시 보임. `studio-lb-last=bungeo-normal`.
   - 칩 → 순위표 "붕어빵 눈싸움 순위 · 보통 (이긴 판 내 땅 %)", 게임 안에서는 탭 없음, 난이도 3칸(radiogroup, aria-checked), 점수 "54.4%"·"54.2%"·"100.0%", 안내 "컴퓨터를 이긴 판의 내 땅 %", →/← 이동. 열려 있는 동안 Enter/Space/P 무시. 칩 aria-label에 "보통 난이도".
8. 홈(home.js) — 탭 7개 `앵무새·똥비·붕어빵·두더지·개구리·뱀·블록`, 마지막 플레이 `bungeo-hard` → 붕어빵 탭 + 어려움, 73.1%, top_scores 바디 정확. 빈 목록 "아직 기록이 없어요. 쉬움에서 컴퓨터를 이겨 보세요!". 탭 →/←/Home, 다른 탭 갔다 오면 고른 난이도 유지, 마지막이 붕어빵이 아니면 보통. 폰 세로: 탭 줄만 가로 스크롤, 선택 탭 보임, 페이지 가로 스크롤 없음. 로드 시 호출은 whoami 1회뿐.
9. `lib/leaderboard.js` 404 — 홈(순위·닉네임 버튼 숨김, 카드 7개) + 게임 7개: 게이트 없음, 시작 정상, 붕어빵 결과 화면 정상(슬롯 비어 있음), 오류 0.
10. 게임 회귀(regress.js, 45/45) — 6개 게임 실제 플레이(poop 22, mole 2090(40초 실제 탭), bunny 6(드래그), snake 10(방향키), block 204, parrot 0): submit 1회/0회와 칩 일치, 로컬 최고 저장, Enter 다시 하기, 일시정지 버튼, 음소거 토글, 오류 0.
11. XSS — 서버가 `<img onerror>`·`<script>` 닉네임을 돌려줘도 순위표에 글자로만 표시(img/script 0개, 실행 안 됨). whoami가 HTML 닉네임을 주면 클라이언트 검사에서 거부(기존 이름 유지).
12. 레이아웃(layout.js, 147/149 — 실패 2건은 비현실적 크기, 아래 참고) — 게이트 단계(닉네임·PIN 정하기·한 번 더·이미 사용·PIN 틀림·잠금) × PC, iPad 세로/가로, iPhone 13 세로, 폰 가로 844×390·740×342·667×375, 키보드 가정 740×240·390×250·1180×420, PC 다크·폰 다크: 모든 입력칸·버튼이 카드와 화면 안, 가로 스크롤 없음. 보이는 높이 < 260에서 한 줄 모드(사이트 이름·개인정보 숨김, 버튼 가로 배치) 확인. 내 정보 시트 3화면, 순위표(붕어빵 세그먼트) 모두 화면 안.
    - 붕어빵 결과(최악: 이김 + 새 기록 배지 + `내 순위 1,234위 · 5,678명 새 순위!`): 1280×800, iPad 세로/가로, 390×844, 844×390, 740×342, 667×375 모두 `#ovResult` 스크롤 0, 칩과 [다시 하기] 안 겹침, [다시 하기] 화면 안. (740×240·390×250은 결과 화면에 키보드가 없으므로 해당 없음 — 이 크기에서는 내용 334px로 넘침)
    - 스크린샷 직접 확인: qa3lb-gate1-nick-pc, gate3-taken-phoneP, gate3-taken-kb390x250, gate4-wrong-kb390x250, gate5-locked-kb740x240, gate2-set1-kb1180x420, bungeo-result-phoneL740, bungeo-result-phoneP, board-bungeo-phoneL740, me-info-pcDark, home-phoneP-board — 잘림·겹침 없음, 다크 대비 양호.
13. 실서버 읽기 1회 — `curl`로 `top_scores {p_game:'bungeo-normal', p_limit:20, p_device:<임의 UUID>}` → HTTP 200 `[]`(현재 v1 함수). 쓰기 호출 없음.

### 버그 (심각도: 치명/높음/보통/낮음)
- [보통] **v3 SQL이 없는 서버에 새 클라이언트가 붙으면 새 방문자가 게이트를 통과할 수 없음(사이트 전체 사용 불가)** / 재현: `claim_nickname`·`whoami`가 HTTP 404(PostgREST `PGRST202`)를 돌려주게 모킹 → 게이트에서 닉네임·PIN 2번 입력 → [시작하기] → "8자 이내 한글·영문·숫자로 적어 주세요"(엉뚱한 문구)와 함께 닉네임 단계로 돌아감, 계속 반복(qa3lb-gate-404-server.png). v1 기기도 상태가 없으므로 같음. / 기대: 서버 쪽 문제는 임시 등록(pending)처럼 게임은 할 수 있어야 함(결정 3 "서버가 멈췄을 때 사이트 전체가 막히면 안 된다") / 원인: `rpc()`가 404를 4xx `reject`로 분류(lib/leaderboard.js 142행), `claim()`이 reject 중 `pin`이 아닌 메시지를 전부 닉네임 형식 오류로 처리(1125~1129행). / **배포 순서(SQL 먼저)를 지키면 영향 없음.** 안전하게 하려면 메시지가 `bad nickname`/`bad pin`이 아닌 reject(404 등)를 fail(pending)로 보는 것을 권장. 이미 `ok` 상태인 기기의 whoami 404는 무시되어 문제 없음.
- [낮음] **최고 기록을 못 넘긴 판에 "새 순위!" 배지가 뜸(이어받은 기기·여러 기기 사용 시)** / 재현: 기기 A에서 29점 기록 → 기기 B가 PIN으로 이어받음 → B에서 5점 → `submit_score(5)`가 나가고 칩 "1위! · 4명 **새 순위!**". A가 B보다 낮은 최고(sent)를 기억하고 있을 때도 같은 일이 생김. / 기대: 서버 최고가 이번 판으로 바뀐 경우에만 배지 / 원인: `sendQueue()`의 `up: !(prev >= row.best)`(lib/leaderboard.js 244행) — 이어받으면 sent가 비어 prev가 없음. `row.best === score && !(prev >= score)` 같은 조건 권장. (낮은 점수 submit 자체는 서버가 최고만 남기므로 무해)
- [낮음] **서버가 기기를 모를 때(`submit_score` → no player) 칩이 "연결되면 순위에 올라가요"로 나오고, 그 판 기록은 다음 로드에서 지워짐** / 재현: 등록된 기기에서 서버 쪽 기기 행을 지운 뒤 똥비 한 판 → 칩 "연결되면 순위에 올라가요", 새로 고침 → 게이트(닉네임 채움) + `studio-lb-queue` 삭제. / 기대: UI 명세 v2 3-1의 "닉네임 확인이 필요해요 ›" 상태. 대기열 처리는 v3-13 5번(상태 없는 기기는 지움)과 맞지만 코드 주석(233행 "기록은 대기열에 남김")과 다름 / 위치: lib/leaderboard.js 232~235행, 1510~1511행. 기록 초기화 직후 옛 v3 기기 정도에서만 생김.

참고(버그 아님):
- 홈 탭 순서는 기획서(카드 순서, 붕어빵 3번째)대로. UI 명세 v2 4절(붕어빵 맨 뒤)과 다르지만 구현 메모에 기획서 우선으로 적혀 있음.
- 새 사람이 이미 있는 이름을 고르면 PIN 확인 1회가 그 이름 주인의 실패 횟수로 셈(5번이면 주인도 15분 동안 새 기기 이어받기 불가, 기존 기기 플레이는 영향 없음). 기획 구현 메모대로.
- `__lb.allowTainted(true)`가 배포 코드에도 있어 콘솔에서 테스트 판을 제출할 수 있음. `submit_score`는 공개 키로 누구나 직접 부를 수 있으므로 보안 차이는 없음.
- 잠금 남은 시간은 이 기기 기준(다른 기기에서 잠겼으면 실제보다 짧거나 다르게 보일 수 있음) — 기획 v3-13 7번대로.

### 실기기 확인 필요
- 실제 iPad/iPhone Safari: 게이트 첫 표시 때 키보드가 자동으로 안 올라오는지(입력칸 강조만), 탭하면 숫자 키패드(`inputmode=numeric`)가 뜨는지, 투명 입력 위 4칸 PIN에 커서·선택 표시가 비치지 않는지, 키보드가 올라온 상태(보이는 높이 < 260)의 한 줄 모드와 `visualViewport` 위치, iOS 암호 저장·SMS 자동완성 제안이 뜨지 않는지, 한글 조합 중 Enter.
- **배포 순서**: Supabase SQL Editor에서 `leaderboard-reset.sql` → `leaderboard-v3.sql` 실행이 끝난 뒤 main 반영. 배포 후 실제 사이트에서 첫 닉네임 등록 → 게임 한 판 → 순위표에 1줄 뜨는지, 다른 기기(또는 사생활 보호 창)에서 같은 닉네임+PIN으로 이어받아 같은 줄에 "나"가 표시되는지 확인.
- 실제 Supabase에서 `crypt`/`gen_salt`(extensions 스키마) 동작 — 로컬에서는 `extensions` 스키마로 재현해 통과했으나 실서버 미검증.
- 붕어빵 실제 컴퓨터 대전 **승리**(사람 손으로)에서 칩·제출 — 자동 테스트의 승리는 훅으로 만든 판(allowTainted)이었음. 실제 판 승리 경로는 패배 경로와 같은 코드이고 점수 계산만 다름.
- 소리: 게이트·내 정보 시트는 소리를 내지 않음. 게이트가 덮인 동안 게임 소리·BGM이 시작되지 않는지 실기기에서 확인.

## 2026-11-15 QA — 공통 순위표 최초 구현 (lib/leaderboard.js + 6개 게임 + 홈, 커밋 727f017)
판정: **통과** (치명·높음 버그 없음. 낮음 4건과 참고 사항은 출시를 막지 않음)

대상: `lib/leaderboard.js`, 6개 게임(poop-rain, mole-pop, bunny-ten, snake-garden, block-stack, parrot-beat)의 `#lbSlot` / `Leaderboard.report` / `isOpen()` 가드, `index.html`의 순위 버튼, `.github/workflows/pages.yml`(`cp -r lib _site/`), `tests/smoke.js`(supabase abort).
환경: Playwright + Chromium(헤드리스). iPad·폰은 Chromium 기기 에뮬레이션. 서버는 `page.route` 모킹. **실서버 submit_score·my_rank는 0회 호출.** 실서버 읽기는 top_scores 1회만.
테스트 스크립트(저장소 밖): `/tmp/claude-0/-home-user-My-first-studio/badfc8a9-5b8e-56e1-ae5b-fb1679c195bf/scratchpad/qalb/` (h.js, flow.js, games.js, misc.js, layout.js, cmp.js, extra.js, live.js)
스크린샷: `/tmp/claude-0/-home-user-My-first-studio/badfc8a9-5b8e-56e1-ae5b-fb1679c195bf/scratchpad/qa-lb-*.png`

### 실행한 테스트와 결과

**1. 회귀 스모크** — `node tests/smoke.js`(전체 7개 게임 × PC / iPad 세로 / iPad 가로, supabase abort): **전부 통과**.

**2. 제출 흐름 (flow.js, 똥비 피하기에서 실제 키 입력으로 플레이) — 74개 항목 통과, 실패 0**
- 첫 판 결과: 칩 `순위에 이름 올리기 ›`만 표시. 2.7초 기다려도 창이 자동으로 뜨지 않음. 서버 요청 0건.
- 닉네임 창: 입력칸에 포커스, 비어 있거나 공백만 있으면 확인 비활성, 공백만 넣고 Enter → 저장 안 됨.
  - 거부: `01012345`, `010-1234-5`, `a@b`, `www.kr`, `abc.com`, `httpman`(→ "전화번호·이메일·주소는 쓸 수 없어요"), `시발`, `씨 발`, `F.u.c.k`, `ADMIN`, `관리자`(→ "다른 이름을 써 주세요"), `😀`, `hi!`, `<b>`(→ "8자 이내 한글·영문·숫자로 적어 주세요").
  - 통과: `콩이`, `Kong_7`, `토끼 99`, `ㅋㅋ`. `' 토끼   99 '`는 `토끼 99`로 정리됨.
  - 9자 입력 → maxlength로 8자에서 멈춤, 카운터 `8/8`.
  - 한글 IME(CDP `imeSetComposition`/`insertText`)로 `콩이` 조합 성공. 조합 중 Enter(keyCode 229)로는 저장 안 됨.
- 일괄 업로드: 로컬 최고(mole 320, parrot 1200, poop 5)와 이번 판(poop 28) 중 큰 값 → `mole-pop:320, parrot-beat:1200, poop-rain:28` 3건. 제외 확인: bunny 0, snake 4001(상한 초과), blockstack `abc`(이상한 값).
  - 요청: `POST https://zzynabrqpwognuwmznna.supabase.co/rest/v1/rpc/submit_score`, `apikey` 값 정확, `Content-Type: application/json`, Authorization 헤더 없음, 바디 키는 정확히 `{p_game,p_device,p_nick,p_score}`, device id는 UUID v4.
- 칩 `내 순위 31위 · 31명 새 순위! 순위표 ›`. 저장 후 칩으로 포커스가 돌아옴.
- 순위표: 제목 `똥비 피하기 순위(점)`, 20줄, 1~3위 금·은·동 원, 20위 밖이면 `⋯` 구분선과 내 줄(나 태그 + 강조), `31명 참여`, `닉네임: 콩이 · 바꾸기`, 개인정보 문구. 열면 닫기 버튼에 포커스, Tab이 창 안에서만 돎. top_scores 바디 `{p_game, p_limit:20, p_device}`.
- 닫기: Esc / X / 바깥 클릭 모두 동작, 포커스가 칩으로 돌아오고 결과 화면 유지.
- 칩에 포커스를 두고 Enter → 순위표가 열리고 다시 하기는 안 됨. 칩에서 Space도 다시 하기 안 됨. 창 안에서 Space/Enter → 다시 하기 안 됨.
- 이후 판: 최고 미갱신(10 ≤ 28) → `my_rank`만. 갱신(37 > 28) → `submit_score` 1회(37), `새 순위!` 배지.
- 오프라인(abort) → 흐린 칩 "연결되면 순위에 올라가요", 대기열 저장, 알림창 없음. `online` 이벤트 → 다시 보내고 대기열 비움, 칩도 순위로 바뀜. 500 → 대기열 유지. 새로 고침 → 다시 보냄. 400 → 대기열에서 삭제. 응답 없음 → 6,002ms에 타임아웃, 대기열 유지.
- 상한 초과(50001), 0점, 자격 없는 판 → 제출 안 함. 칩은 "테스트 판은 순위에 안 올라가요".
- 닉네임 변경(`Kong_7`) → sent에 있는 3개 게임 전부 같은 점수로 다시 제출, 아래 줄 갱신, 포커스는 창 안.
- 불러오기 실패 → "지금은 순위를 불러올 수 없어요" + [다시 시도] → 다시 불러오면 정상. 빈 목록 → "아직 기록이 없어요…". 20위 안의 내 줄 강조.
- 추가(extra.js): 다른 게임에서 닉네임을 등록해 sent가 없을 때 → max(이번 판 120, 로컬 최고 500)=500 제출. 1위 칩 `1위! · N명`(금색 원). `studio-lb-last` 저장. 대기열은 게임마다 더 높은 점수만 남김. 잘못된 device id → 새로 만듦. `__lb`는 열거되지 않음.
- 콘솔 오류 0.

**3. 게임별 입력 차단·제출 자격 (games.js, 6개 게임 × PC·iPad 에뮬레이션) — 전부 통과**
- 자연스러운 판(실제 클릭·키·드래그): poop 22~30점, mole 2180/2390점(40초 동안 실제로 두더지를 탭), bunny 6마리(마우스 드래그로 합 10), snake 10점(방향키), block 206점, parrot 0점 → 모두 `eligible:true`. 점수 > 0이면 submit 1회와 `ok` 칩, 0점이면 제출 없이 "기록을 세우면 순위에 올라가요".
- 순위표가 열린 동안 Space·Enter·방향키·P·M·A를 누르고, 포커스 없는 상태에서도 Enter/Space를 누르고, 창 안을 탭(iPad는 touchscreen.tap)하고 목록을 터치로 드래그(iPad) → 6개 게임 모두 상태 변화 없음, 음소거 상태도 그대로.
- 바깥(배경) 탭 → 창만 닫히고 게임에 전달 안 됨(두더지 판 탭, 앵무새 치기 없음).
- 닉네임 창에서 ` a p m ` + Space를 입력 → 글자는 입력칸에 들어가고 게임은 반응 없음. Esc 1번 = 닉네임 창만 닫힘, 2번 = 순위표 닫힘.
- PC: 칩에 포커스 두고 Enter → 순위표 열림(다시 하기 안 됨).
- 닫은 뒤 Enter → 6개 게임 모두 정상 재시작. block-stack: 일시정지 오버레이에서 슬롯 숨김 확인.
- 오염 판: poop `simulate`, mole `setTime`, bunny `solution` → `eligible:false`, 제출 0, "테스트 판은 순위에 안 올라가요".
- parrot-beat: `start({stage:2})` → 자격 없음(test). 틀린 곳부터(`retryFromFail`) 판 → 자격 없음, "이어하기 판은 순위에 안 올라가요"(qa-lb-parrot-retry-inel.png). `autoPlay`를 켰다가 판 도중 꺼도 → 자격 없음. 그다음 보통 판 → 다시 자격 있음.
- 콘솔 오류 0.

**4. 모듈 404·서버 불통 (misc.js) — 전부 통과** (mole의 "칩 상태" 2건은 테스트가 `setTime`을 써서 '테스트 판'이 정상으로 나온 것. 버그 아님)
- `lib/leaderboard.js` 404: 6개 게임 모두 결과 화면 정상, 로컬 최고 = 점수로 저장, 슬롯 비어 있음, Enter로 다시 하기 정상, 오류 0. 홈 `순위` 버튼 숨김, 카드 7개 정상.
- 서버 abort + 닉네임 없음: 칩 `nonick`, 요청 없음. 서버 abort + 닉네임 있음: 칩 "연결되면 순위에 올라가요", 게임 정상. 홈 모달은 실패 문구 표시.
- localStorage 접근 차단(사생활 모드 흉내): 오류 없이 메모리로 동작, 닉네임 저장과 제출 성공.

**5. 홈 (misc.js)** — 시작 시 요청 0. 카드(`<a>`) 안에 버튼 없음. 순위 버튼은 title-row 안, 높이 44px. 탭 6개가 카드 순서(앵무새·똥비·두더지·개구리·뱀·블록)대로이고 기본 탭은 `studio-lb-last`(두더지). ←/→/Home 이동과 탭 줄 끝에서 넘어가기, 클릭으로 탭 바꾸기, Esc 누르면 순위 버튼으로 포커스 복귀. 모두 통과.

**6. 레이아웃 (layout.js + 스크린샷 직접 확인)** — 6개 게임 × PC 1280×800, iPad 810×1080·1080×810, 폰 844×390·740×342·667×375, iPhone 13 세로, PC 다크, iPhone 13 다크. 칩은 최악의 경우(`내 순위 1,234위 · 5,678명 새 순위! 순위표 ›`, 닉네임 8자)와 `nonick` 두 가지로 측정.
- poop / mole / bunny / snake / parrot: 모든 화면 크기에서 결과 오버레이 `scrollHeight === clientHeight`, 가로 스크롤 없음, 칩이 화면 안에 있고 버튼·글자와 겹치지 않음. 단 snake는 아래 [낮음] 2번 참고.
- block-stack: 폰 가로 3종에서 칩과 [다시 하기]가 화면 아래(461px)로 나감 → **기존 문제**(이전 커밋 5980d63에서도 [다시 하기] 아래쪽이 442px이고 문서를 세로로 스크롤해야 함). 순위표 때문에 생긴 회귀는 아니고, 오버레이 자체는 600/600.
- 순위표 모달: 모든 크기에서 화면 안, 닫기 44×44, 아래 줄 보임, 가로 스크롤 없음. 폰 세로는 아래 시트, 폰 가로 740×342에서는 목록이 3줄쯤 보이고 스크롤됨.
- 닉네임 창: 모든 크기에서 화면 위쪽에 붙고, 입력칸 48px·글자 16px, 확인 44px. 보이는 높이 220px에서는 한 줄 모드(`lb-tiny`, [입력칸][확인] + 위쪽 "나중에").
- 홈 모달: iPhone 13 세로/다크(아래 시트), 844×390, 667×375, 340px 폭, PC, iPad → 화면 안, 탭 높이 ≥ 40, 가로 스크롤 없음.
- 다크 모드: 칩·모달·금은동 원 모두 잘 읽힘.

**7. 실서버 읽기 1회 (live.js)** — `curl`로 `top_scores {p_game:'parrot-beat', p_limit:20, p_device:<새 UUID>}` → **HTTP 200, `[]`**. 이 응답을 홈 모달에 넣어 "아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!"가 나오는 것을 확인. (테스트 환경의 Node에서는 Supabase 도메인 이름을 찾지 못해 curl(프록시)로 1회만 호출함. submit_score·my_rank는 실서버에 보내지 않음.)

**8. 보안 간단 점검**
- 저장소 전체에서 `service_role`·`sb_secret`·JWT(`eyJhbGci`)는 나오지 않음. 모듈에는 공개(publishable) 키만 있음.
- `innerHTML`은 고정 문자열(SVG, 칩 틀, 스켈레톤, 비우기)에만 쓰고, 닉네임·숫자는 `textContent`/`setAttribute`로 넣음. 서버가 닉네임으로 `<img src=x onerror=…>`, `<script>…`를 돌려주도록 모킹 → 글자로만 보이고 실행되지 않음(`window.__xss` 없음, img 0개).

### 버그 (심각도: 치명/높음/보통/낮음)
- [낮음] **순위표에 "N명 참여"가 안 나오는 경우가 있음** / 재현: 참여자가 20명 이상인 게임의 순위표를 연다. ① 내가 상위 20 안에 있거나 ② 그 게임에 내 기록이 없으면(홈에서 처음 보는 사람 포함) 아래 줄의 참여 인원이 빈칸(qa-lb-home-phoneP-board.png, 홈 앵무새 탭 25명) / 기대: 기획 4장대로 참여 인원 표시 / 위치: `lib/leaderboard.js` `load()` 640~660행. `rows.length >= topN`이고 `!meRow`일 때만 `my_rank`로 total을 받고, 그 외에는 total을 채우지 않음(top_scores 응답에는 total이 없음).
- [낮음] **snake-garden 폰 가로 740×342에서 결과 제목 "게임 끝" 윗부분이 잘림** / 재현: 740×342에서 판을 끝냄(닉네임 있음, 칩 표시). 결과 오버레이의 첫 줄 위치가 -18px(이전 버전은 +20px) / 기대: 제목이 보임 / 원인: 기존 코드 `againBtn.focus()`(602행, preventScroll 없음)가 `overflow:hidden`인 body를 스크롤시키고(사용자는 되돌릴 수 없음), 칩 한 줄(약 38px)이 늘어서 제목이 위로 밀림. 667×375·844×390에서는 다 보임. 위치: `games/snake-garden/index.html` 602행 / 45행.
- [낮음] **block-stack 좁은 화면(iPhone 13 세로)에서 큰 숫자 + "새 순위!" 배지면 참여 인원이 "5,…"로 잘림** / 재현: 칩 상태 `내 순위 1,234위 · 5,678명 새 순위!`(4자리 순위·인원) / 기대: 숫자가 보임(짧은 형식은 이미 적용됨) / 현실적인 숫자(2~3자리)에서는 잘리지 않음. 위치: `lib/leaderboard.js` `render()`/`fitChip()`, block-stack 오버레이 폭.
- [낮음] **테스트 훅 중 일부는 '오염 판'으로 표시되지 않음(기획 표와는 맞음, CEO 지시 "테스트 훅 쓴 판 제출 안 함"과는 다름)** / poop `__poop.setTime(600)`·`spawn`·`setPlayerX`, parrot `setStage`·`setHearts`·`tapAt`를 써도 `eligible:true`. 특히 `__poop.setTime(600)` 하나로 6,000점 이상이 제출될 수 있음. 또 parrot의 로컬 최고(`parrot-beat-best`)는 `start({stage:N})`·autoPlay 판에서도 저장되므로 첫 등록 일괄 업로드 때 함께 올라감 / 기대: 기획을 유지할지, 위 훅도 tainted로 볼지 CEO/기획이 결정 / 위치: `games/poop-rain/index.html` 2312~2340행, `games/parrot-beat/index.html` 1481~1484행과 2298~2306행. 일반 사용자 흐름에는 영향 없음(콘솔에서만 쓸 수 있음).

참고(버그 아님):
- block-stack 폰 가로에서 [다시 하기]가 화면 아래로 나가는 것은 순위표 전부터 있던 문제.
- parrot-beat는 결과 화면에서 Enter(또는 가장 큰 버튼)가 "틀린 곳부터"(이어하기)이므로, Enter로 계속하는 사용자의 판은 대부분 순위에 오르지 않음. 기획 의도와 같지만 사용자는 놓치기 쉬움.
- iPad 에뮬레이션에서 목록을 손가락으로 튕긴(관성 스크롤) 직후 바깥을 탭하면 첫 탭은 스크롤만 멈추고 창이 안 닫힘. 브라우저 기본 동작임.

### 실기기 확인 필요
- 실제 iPad/iPhone Safari(WebKit): 닉네임 입력 시 키보드가 올라올 때 창 위치(`visualViewport`), 한 줄 모드 전환, 한글 조합 중 Enter, `enterkeyhint="done"`, 입력칸 16px(확대 안 됨).
- 실제 사이트(github.io)에서 Supabase CORS와 실제 제출: 브라우저에서 첫 등록 → 순위 표시. 이번 QA에서는 실서버에 쓰지 않았음. 첫 실사용 기록이 실서버에 올라가는 것을 사용자가 확인해야 함.
- 배포 후 `lib/leaderboard.js`가 404가 아닌지(pages.yml `cp -r lib _site/` 반영) — Actions 결과와 홈 `순위` 버튼이 보이는지로 확인.
- snake-garden 폰 가로(740×342 급)에서 결과 제목이 잘리는지, block-stack 폰 가로에서 [다시 하기]까지 스크롤이 되는지.
- Safari 사생활 보호 모드에서 순위 기능(메모리 모드)이 오류 없이 동작하는지.
- 소리: 순위표는 소리를 내지 않음. 창이 열려 있을 때 게임 소리에 변화가 없는지 실기기에서 확인.
