# 뱀 정원 아트·UI 명세

> slug: `snake-garden` · 기획서 `docs/games/snake-garden/design.md`와 같은 수치 사용 (정원 15×15칸, 산딸기/황금 열매, 게임 오버 시 머리 0.5초 깜빡임, 재시작 잠금 0.5초).
> 모든 그래픽은 Canvas 2D 도형과 CSS로 그린다. 이미지 파일·이모지 그래픽 없음.

## 스타일 콘셉트
- "햇살 드는 작은 텃밭": 연한 풀색 체크무늬 정원 위를 둥글둥글한 초록 뱀이 기어 다닌다. 블록 스택과 같은 따뜻한 종이색 배경(`--bg`), 흰 패널 카드, 주황 강조색(`--accent`)을 그대로 쓴다.
- 형태는 모두 둥근 모서리. 테두리 선은 얇게, 그림자 대신 면 색 차이로 구분 (블록 스택과 같은 플랫 톤).
- 폰트: 사이트 공통 `system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`. 숫자는 `font-variant-numeric: tabular-nums`.

## 색상 토큰 (라이트/다크, hex)
공통 토큰은 블록 스택과 **값과 이름을 동일하게** 둔다. 다크모드는 블록 스택과 같은 3단 구조(`@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` + `:root[data-theme="dark"]`).

| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--bg` | #f4f1ea | #12141a | 페이지 배경 |
| `--panel` | #ffffff | #1b1e27 | HUD 카드, 버튼 |
| `--ink` | #1f2430 | #eceef3 | 본문 글자 |
| `--muted` | #6b7280 | #9aa1ae | 보조 글자, 라벨 |
| `--grid` | #e7e2d8 | #262a35 | 카드 테두리 |
| `--well` | #fbfaf7 | #161921 | 오버레이 바탕 |
| `--accent` | #e4572e | #ff7a50 | 주 버튼, 강조, 혀 |
| `--fence` | #c9b48a | #4a4232 | 정원 울타리(보드 테두리 4px) |
| `--tile-a` | #e9f2dc | #18221b | 체크무늬 칸 A |
| `--tile-b` | #dfeccf | #1c2820 | 체크무늬 칸 B |
| `--snake` | #3f9d5a | #5cc27a | 뱀 몸 |
| `--snake-head` | #2f8049 | #4aae68 | 뱀 머리 |
| `--snake-spot` | #8fd19e | #9be3ad | 몸 무늬 점 |
| `--eye` | #ffffff | #ffffff | 눈 흰자 |
| `--pupil` | #1f2430 | #12141a | 눈동자 |
| `--berry` | #e0374f | #ff5c72 | 산딸기 |
| `--berry-seed` | #ffd6dc | #ffd6dc | 산딸기 씨 점 |
| `--leaf` | #3f9d5a | #5cc27a | 열매 꼭지 잎 |
| `--gold` | #f2b134 | #ffc94d | 황금 열매 (블록 스택 O 블록과 같은 노랑) |
| `--gold-edge` | #b9801a | #e09a20 | 황금 열매 테두리/타이머 링 |

- Canvas는 CSS 변수를 직접 못 읽으므로 시작 시와 `matchMedia('(prefers-color-scheme: dark)')` change 이벤트 때 `getComputedStyle(document.documentElement).getPropertyValue('--snake')` 등으로 읽어 팔레트 객체에 캐시하고 다시 그린다.
- `<meta name="theme-color" content="#e4572e">` 유지.

## 레이아웃 (PC / iPad 세로 / iPad 가로)

### 공통 구조 (위→아래)
```
[← 게임 목록]                        (링크 행, 높이 44px)
[뱀 정원]  [점수][길이][최고]  [Ⅱ]   (제목+HUD 행, 높이 52px)
┌──────── 정원 보드 (정사각) ────────┐
│                                    │
└────────────────────────────────────┘
        [ D-pad ]                     (터치 기기만)
```
- 보드는 항상 **정사각형**. 캔버스 내부 해상도 = 표시 크기(px) × `devicePixelRatio`(최대 2), 칸 크기 `c = boardPx / 15`. 표시 크기가 바뀌면(resize, orientationchange) 캔버스를 다시 맞춘다.
- 보드 = 울타리 테두리 `4px solid var(--fence)`, `border-radius: 12px`, 안쪽 캔버스 `border-radius: 8px`.

### 높이 기준 레이아웃 규칙 (필수 — 블록 스택 iPad 가로 12px 잘림 재발 방지)
1. **앱 높이 변수**: JS로 `--app-h = window.innerHeight + 'px'`를 `resize`·`orientationchange`·`visualViewport.resize` 때 갱신. CSS 기본값은 `100dvh`(미지원 시 `100vh`). `100vh`만 단독으로 쓰지 않는다(Safari 주소창 포함 높이라 잘림).
2. `html, body { height: var(--app-h); overflow: hidden; }` — 페이지 세로·가로 스크롤 모두 없음. 모든 요소가 한 화면 안에 들어가야 한다.
3. body 패딩: `max(12px, env(safe-area-inset-*))` 네 방향. viewport meta에 `viewport-fit=cover` 추가.
4. **보드 크기는 너비와 높이 둘 다로 제한**하고 작은 쪽을 쓴다. 고정 요소(링크·HUD·D-pad·간격) 높이를 먼저 빼고 남은 높이로 보드를 정한다:
   - `--board = min(가용 너비, 가용 높이)`; CSS `min()`/`calc()` 로 계산하거나 JS로 같은 식 계산 후 변수로 넣는다.
5. 수치 (gap = 10px 기준):

| 화면 | 판정 | D-pad 위치 | 보드 크기 식 | 예상 보드 |
|---|---|---|---|---|
| PC (키보드) | `(pointer: fine)` | 없음 | `min(560px, 100vw − 32px, app-h − 24 − 44 − 52 − 40(키 안내) − 30)` | 800 높이 → 560px |
| iPad 세로 | `(pointer: coarse) and (orientation: portrait)` | 보드 **아래** 가운데 | `min(100vw − 32px, app-h − 24 − 44 − 52 − 232(D-pad) − 30)` | 810×1080 → 698px, Safari 실높이 ~980 → 598px |
| iPad 가로 | `(pointer: coarse) and (orientation: landscape)` | 보드 **오른쪽** 세로 열 (HUD 카드 + D-pad) | `min(app-h − 24 − 44 − 10, 100vw − 32px − 260px(오른쪽 열) − 20px)` | 1080×810 → 732px, Safari 실높이 ~740 → 662px |
| 폰 세로 | coarse, 너비 < 500px | 보드 아래, 버튼 60px | iPad 세로 식, D-pad 높이 196 | 390×750 → 358px |

   - iPad 가로에서는 제목+HUD 행을 없애고 HUD를 오른쪽 열 위에 세로 카드 3개로 쌓는다(제목은 오른쪽 열 맨 위, 18px). 오른쪽 열 너비 260px, D-pad는 열 아래쪽에 정렬(`margin-top: auto`)해 엄지가 닿기 쉽게.
6. **검증 기준** (QA와 공유): `node tests/smoke.js snake-garden`로 810×1080, 1080×810 에서 D-pad 마지막 버튼 `getBoundingClientRect().bottom ≤ innerHeight − 4` 그리고 `document.documentElement.scrollHeight ≤ innerHeight`. 가능하면 1080×740(가로 + Safari 주소창 가정)도 확인.

### "← 게임 목록" 링크
- 화면 왼쪽 위, 글자 14px `var(--muted)`, 밑줄 없음. 터치 영역은 `min-height: 44px; display: inline-flex; align-items: center; padding: 0 8px; margin-left: -8px`.
- hover/focus 시 `var(--ink)`. 링크 대상 `../../`(목록 페이지). 게임 중 눌러도 확인창 없이 이동(진행은 저장하지 않음).

## HUD·메뉴·오버레이

### HUD (점수 / 길이 / 최고 + 일시정지)
- 블록 스택 `.card`와 같은 카드: 배경 `--panel`, 테두리 1px `--grid`, radius 10px, 패딩 6px 12px.
- 라벨 11px 600 `--muted` 자간 .08em (`점수`, `길이`, `최고`), 값 20px 700 `--ink` tabular-nums. 카드 최소 너비 72px.
- 최고 점수가 이번 판에서 갱신되는 순간부터 `최고` 카드 값 색을 `--accent`로.
- 일시정지 버튼: 44×44px, `Ⅱ` 18px, 카드와 같은 배경/테두리, radius 10px, HUD 행 오른쪽 끝. 일시정지 중엔 `▶`로 바뀜. `aria-label="일시정지"`/`"계속하기"`.

### 오버레이 (보드 위에 겹침)
- 블록 스택과 동일: `position:absolute; inset:0`, 배경 `color-mix(in srgb, var(--well) 84%, transparent)`, 가운데 정렬 세로 스택 gap 10px, 페이드 인 200ms.
- 제목 24px 800, 본문 14px `--muted`. 주 버튼 `button.primary`(배경 `--accent`, 흰 글자 700, 높이 48px, 패딩 0 24px, radius 10px). 보조 버튼은 `--panel` 바탕.

| 오버레이 | 내용 |
|---|---|
| 시작 | 제목 "뱀 정원", 한 줄 "열매를 먹고 길어지세요. 울타리와 내 몸은 피하기!", 열매 범례(산딸기 그림 +10 · 황금 열매 그림 +50, 캔버스 20px 미니 아이콘), `최고 N점`, 주 버튼 "시작하기", 조작 안내 12px (PC: "방향키/WASD 이동 · Space 일시정지", 터치: "보드를 밀거나 아래 버튼으로 이동"). 뒤에는 시작 배치 뱀이 정지 상태로 보인다. |
| 일시정지 | 제목 "일시정지", 주 버튼 "계속하기", 보조 버튼 "처음부터". |
| 게임 오버 | 제목 "게임 끝", 점수 40px 800 tabular-nums, 그 아래 "길이 N칸 · 최고 N점" 14px. 신기록이면 제목 위에 배지 "새 기록!" (배경 `--gold`, 글자 `#1f2430`, 12px 800, radius 999px, 패딩 4px 10px). 주 버튼 "다시 하기", 보조 링크 "← 게임 목록". 표시 후 0.5초 동안 버튼 `disabled`(opacity .5) — 기획서의 입력 잠금. |
| 클리어 | 제목 "정원 완성!", 배지 "새 기록!" 규칙 동일, 나머지는 게임 오버와 같음. |

## 보드·캐릭터 그리기 (Canvas 2D, c = 칸 크기)

### 정원 (배경)
- 칸 (x, y)마다 `(x + y) % 2 === 0 ? --tile-a : --tile-b`로 `fillRect`. 칸 사이 선 없음(체크무늬로 격자 표현).
- 매 프레임 다시 그리면 비용이 있으니 오프스크린 캔버스에 한 번 그려두고 `drawImage`.

### 뱀
- 좌표: 칸 중심 `cx = (x + .5) * c`.
- **몸 (머리·꼬리 제외)**: 머리 다음 마디부터 꼬리 직전 마디까지 중심점을 잇는 폴리라인을 `lineWidth = .76c`, `lineCap = lineJoin = 'round'`, `strokeStyle = --snake`로 한 번에 stroke → 꺾이는 곳이 자연스럽게 둥글다.
- **무늬**: 머리에서 2번째 마디부터 2칸마다 마디 중심에 원 반지름 `.12c`, `--snake-spot`. (색만이 아니라 무늬로 진행 방향이 보이게)
- **꼬리**: 마지막 마디는 굵기가 줄어드는 사다리꼴. 꼬리 직전 마디 중심에서 너비 `.76c` → 꼬리 끝 칸 중심에서 너비 `.30c`인 다각형을 채우고, 끝에 반지름 `.15c` 원. 색 `--snake`.
- **머리**: 머리 칸 중심에서 진행 방향으로 `.06c` 앞으로 민 위치에 원 반지름 `.46c`, `--snake-head`.
  - 눈 2개: 진행 방향 기준 앞으로 `.12c`, 좌우로 `±.20c` 위치에 흰자 원 반지름 `.15c`(`--eye`), 눈동자 반지름 `.08c`(`--pupil`)를 진행 방향으로 `.04c` 더 앞에.
  - 혀: 2초마다 150ms 동안만, 머리 앞끝에서 진행 방향으로 길이 `.28c` 선(`lineWidth .06c`, `--accent`) + 끝에서 ±35° 갈래 `.10c`. 일시정지·게임 오버 중엔 안 보임.
  - 방향 회전은 `ctx.rotate(각도)`로 한 벌의 그리기 코드를 재사용.
- 길이 1~2일 때도 깨지지 않게: 몸 폴리라인 점이 2개 미만이면 생략.
- 이동 표현: 기본은 틱마다 칸 단위로 스냅(가장 단순·정확). 여유가 있으면 머리·꼬리만 `requestAnimationFrame` 보간(틱 경과율 0~1)으로 미끄러지게 해도 됨 — 판정은 언제나 칸 기준.

### 산딸기 (일반 열매, 동그라미)
- 칸 중심에 원 반지름 `.36c`, `--berry`.
- 씨 점 3개: 중심 기준 (−.12c, 0), (.12c, .02c), (0, .14c)에 반지름 `.04c` 원, `--berry-seed`.
- 하이라이트: (−.14c, −.14c)에 반지름 `.08c` 흰색 alpha .45.
- 꼭지 잎: 원 꼭대기 (0, −.36c)에서 위로, 타원 2개(가로반지름 `.14c`, 세로 `.07c`)를 ±25° 기울여 좌우로, `--leaf`.
- 대기 애니메이션: 반지름 배율 1.0 ↔ 1.06, 주기 1200ms, sine.

### 황금 열매 (보너스, 별 모양 — 산딸기와 **모양이 다름**)
- 칸 중심에 5각 별: 바깥 반지름 `.42c`, 안쪽 `.20c`, 꼭짓점 하나가 위. 채움 `--gold`, 테두리 `lineWidth .05c` `--gold-edge`, `lineJoin round`.
- 가운데 반짝임: (−.08c, −.08c)에 반지름 `.06c` 흰 원 alpha .7.
- **남은 시간 링**: 칸 중심 반지름 `.48c`의 원호, `lineWidth .06c`, `--gold-edge`, 12시 방향에서 시계 방향으로 `남은시간/6초 × 360°`만큼. 시간이 줄수록 호가 짧아진다.
- 마지막 2초: 깜빡임 4Hz (alpha 1 ↔ .3, 125ms 간격 토글) — 기획서 규칙.
- 회전: 별 전체가 천천히 ±8° 흔들림, 주기 1600ms.

## 애니메이션·이펙트 (지속시간 ms, easing)

| 이펙트 | 내용 | 시간 | easing |
|---|---|---|---|
| 열매 등장 | 크기 0 → 1 | 180 | ease-out-back (`1 + 2.7(t−1)³ + 1.7(t−1)²`) |
| 황금 열매 등장 | 크기 0 → 1 + 칸 주변 링 퍼짐(반지름 .5c→.9c, alpha .6→0) | 260 | ease-out-back / ease-out |
| 황금 열매 사라짐(시간 초과) | 크기 1 → 0, alpha 1 → 0 | 200 | ease-in |
| 산딸기 먹기 | 먹은 칸에서 입자 8개(`--berry`, 반지름 .08c)가 방사형으로 .9c 이동하며 alpha 1→0 | 320 | ease-out (`1−(1−t)³`) |
| 황금 열매 먹기 | 입자 12개(`--gold`, 작은 별/원 혼합) 1.2c 이동 + 보드 테두리가 `--gold`로 한 번 반짝 | 420 / 300 | ease-out |
| 점수 팝업 | 먹은 칸 위에 "+10"(14px 800 `--ink`) / "+50"(16px 800 `--gold-edge`)이 위로 .8c 떠오르며 사라짐 | 600 | ease-out |
| 삼킴 볼록 | 먹은 직후 머리 다음 마디부터 틱마다 한 칸씩 꼬리 쪽으로 이동하는 "볼록" 원(반지름 .46c, `--snake`)을 몸 위에 덧그림. 꼬리에 닿으면 끝 | 틱 단위 | — |
| HUD 숫자 | 점수 바뀔 때 값 scale 1 → 1.15 → 1 | 160 | ease-out |
| 게임 오버 | ① 이동 정지, 머리 눈을 × 모양(선 `.05c` `--pupil`)으로 바꿈 ② 머리 깜빡임 alpha 1↔.3 4회 = 500ms ③ 동시에 보드 흔들림 좌우 ±6px 3회 240ms ④ 몸 색이 `--snake` → `--muted`로 400ms 동안 섞임 ⑤ 500ms 뒤 오버레이 페이드 인 | 총 ~700 | linear / ease-out |
| 오버레이 | opacity 0→1, 안쪽 내용 translateY 8px→0 | 200 | ease-out |
| 버튼 눌림 | scale .94, 배경 `--grid` | 80 | ease-out |

- `prefers-reduced-motion: reduce`: 보드 흔들림·입자·떠오르는 팝업·열매 대기 흔들림 끔. 깜빡임은 alpha 대신 링/테두리 색만 유지(정보 손실 없음).
- 이펙트는 게임 로직과 분리된 짧은 배열(`effects[]`)로 관리, 일시정지 중엔 시간 정지.

## 조작 UI (터치 버튼 크기 ≥ 44px, 제스처, 키 매핑)

### 키보드 (PC)
| 키 | 동작 |
|---|---|
| ↑ ↓ ← → / W A S D | 방향 전환 (바로 반대 방향은 무시 — 로직 담당) |
| Space / P / Esc | 일시정지 ↔ 계속 |
| Enter | 시작 / 다시 하기 (잠금 0.5초 지난 뒤) |
- 방향키 기본 스크롤 `preventDefault`. 짧은 시간 연속 입력(예: ↑ → 빠르게)이 씹히지 않게 방향 입력 큐 최대 2개 권장.
- 창이 포커스를 잃으면(`blur`, `visibilitychange`) 자동 일시정지.

### 스와이프 (보드 위)
- 보드 요소에 `touch-action: none`, 포인터 이벤트(`pointerdown/move/up`) 사용.
- `pointermove`에서 시작점 대비 이동 거리가 **24px**를 넘으면 큰 축 방향으로 즉시 방향 전환(손을 떼기를 기다리지 않음). 전환 후 기준점을 현재 위치로 다시 잡아 한 번의 긋기로 연속 회전(ㄱ자) 가능.
- 보드 탭(이동 < 10px)은 아무 동작 없음(실수 방지). 시작/다시 하기는 버튼으로만.

### D-pad (터치 기기에서만 표시: `@media (pointer: coarse)`)
- 3×3 격자 십자 배치, 가운데 칸은 비움(장식용 원 지름 20px `--grid`만, 터치 무반응).
```
      [▲]
 [◀]   ·   [▶]
      [▼]
```
- 버튼 크기: iPad **72×72px**, 폰(너비 < 500px) **60×60px**. 간격 8px → 전체 232×232 / 196×196px.
- 모양: radius 16px, 배경 `--panel`, 테두리 1px `--grid`, 화살표 26px `--ink`. 눌림 상태 배경 `--grid`, scale .94.
- 반응: `pointerdown`에서 바로 처리(click 지연 없음), `preventDefault`. 길게 눌러도 반복 입력 없음.
- 배치: iPad 세로는 보드 아래 가운데, iPad 가로는 오른쪽 열 하단(오른손 엄지). 버튼에 `aria-label` "위로/아래로/왼쪽으로/오른쪽으로".
- 일시정지 버튼은 D-pad에 넣지 않고 HUD 행(가로 모드는 오른쪽 열 상단)에만 둔다 — 방향 누르다 실수로 멈추는 것 방지.

### iPad Safari 공통
- `body { touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }`
- 더블탭 확대 방지: `touch-action` 설정 + 버튼에서 `dblclick` 기본 동작 차단. 가로 스크롤 금지(`overflow: hidden`).
- `apple-mobile-web-app-capable` 등 메타는 목록 페이지와 동일하게.

## 접근성 (대비, 색 외 구분 수단)
- 대비: `--ink` 대 `--bg`/`--panel` 모두 12:1 이상, `--muted` 대 `--panel` 4.5:1 이상(블록 스택과 동일 토큰). 흰 글자 주 버튼(`#e4572e`)은 18px 이상 굵게로 큰 글자 기준 충족.
- 열매 구분은 색만이 아니라 **모양**(산딸기 = 원+잎, 황금 열매 = 별+타이머 링)으로. 적록색약에서도 뱀(초록)과 산딸기(빨강)는 밝기 차이 + 산딸기 흰 씨점·하이라이트로 구분.
- 뱀 머리는 몸보다 크고 눈이 있어 색 없이도 방향을 알 수 있다.
- 오버레이 열릴 때 주 버튼에 `focus()`, 키보드 포커스 링 `outline: 3px solid var(--accent); outline-offset: 2px`.
- 점수 갱신은 화면 낭독 과다를 막기 위해 게임 오버 결과만 `aria-live="polite"` 영역에 문장으로("게임 끝. 점수 120점, 길이 14칸").
- 캔버스에 `role="img" aria-label="뱀 정원 게임 보드"`.
