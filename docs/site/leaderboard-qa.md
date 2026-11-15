# 사이트 공통 온라인 순위표 QA 리포트

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
