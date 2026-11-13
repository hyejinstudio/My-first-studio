# 두더지 뿅뿅 아트·UI 명세

> slug: `mole-pop` · 기획서 `docs/games/mole-pop/design.md`(점수 값, 제한 시간, 출현 시간, 콤보 규칙)와 `sound.md`를 함께 본다. **수치(점수·시간·콤보 배율)는 design.md가 정하고**, 이 문서는 그 값을 어떻게 보여 줄지만 정한다. 아래 예시의 `+10 / +50 / −20`, `60초`는 자리 표시용이다.
> 그래픽은 **DOM + 인라인 SVG + CSS**로 그린다. 이미지 파일·이모지 그래픽·외부 이미지 없음.
> 참고 이미지(다른 앱: 안전모 쓴 두더지, 나무 울타리, 나무 점수판)는 **따라 하지 않는다**: 모자·헬멧·옷·나무 울타리·나무 간판·나무결 무늬 금지. 이 게임 고유 요소 = **얼굴 단순한 둥근 콩 모양 두더지 + 연한 세이지 잔디 판 + 모래색 흙 둔덕 + 신호 불꽃 달린 회청 폭탄**.

## 스타일 콘셉트
- "조용한 뒷마당의 두더지 굴": 옅은 세이지색 잔디 판 위에 모래색 흙 둔덕 9개(3×3). 둔덕 가운데 구멍에서 둥근 콩 모양 두더지가 쏙 올라왔다가 들어간다. 맞히면 눈을 질끈 감고(`> <`) 쏙 들어가며 작은 별 3개가 퍼진다.
- **눈 피로 최소화 (사용자 누적 취향)**: 판·둔덕·두더지 모두 채도 낮은 흙·풀 계열. 외곽선은 1.5px의 연한 같은 계열 색. 체크무늬·잔디 결·나무결·그라데이션·그림자·광택 하이라이트 없음. 화면 전체 깜빡임·흔들림 없음.
- **두더지 얼굴**: 작은 점 눈 2개 + 작은 코 1개만. 입·볼터치·눈썹·이빨·수염·눈 흰자 없음. 두더지는 최대 9마리라 빽빽하지 않으므로 이 정도는 허용(CEO 브리프).
- 세 종류는 **모양으로 먼저** 구분한다: 일반 = 무늬 없는 두더지 / 황금 = 이마에 별 + 옆에 반짝이 / 폭탄 = 두더지가 아닌 둥근 폭탄(얼굴 없음, 심지·불꽃). 색은 보조 수단.
- 스튜디오 공통: 따뜻한 종이색 페이지 배경(`--bg`), 흰 패널 카드, 주황 강조색(`--accent`), 둥근 모서리, 그림자 대신 면 색 차이. 개구리 텐과 같은 상단 바·시간 막대·오버레이 구조.
- 글꼴: 글자는 사이트 공통 `system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`. **숫자(점수·시간·콤보·최고·점수 팝업·결과 점수)는 MoleDigits(Pretendard ExtraBold 800 서브셋)**.

### 숫자 글꼴 MoleDigits (Pretendard, SIL OFL 1.1)
- 개구리 텐 `games/bunny-ten/fonts/bunny-digits-800.woff2`와 같은 방식. 원본: Pretendard **ExtraBold(800)**.
- 파일: `games/mole-pop/fonts/mole-digits-800.woff2` + 같은 폴더에 `OFL.txt`(Pretendard 저작권 줄 + OFL 1.1 본문, 개구리 텐 것 복사 가능).
- 서브셋 글리프: `0-9`(U+0030–0039), `+`(U+002B), `-`(U+002D), `−`(U+2212), `×`(U+00D7), `x`(U+0078), `:`(U+003A), `.`(U+002E — 콤보 배율이 소수일 경우 대비). 
- **Reserved Font Name 때문에 이름 변경 필수**: name 테이블 family/full/PostScript/typographic 이름 모두 `MoleDigits`, 압축 해제 바이트에 "Pretendard" 문자열이 없어야 함(QA가 fontTools로 확인 — 개구리 텐과 같은 검사).
- 예: `pyftsubset Pretendard-ExtraBold.otf --unicodes="U+0030-0039,U+002B,U+002D,U+2212,U+00D7,U+0078,U+003A,U+002E" --flavor=woff2 --layout-features='tnum' --output-file=mole-digits-800.woff2` 후 fontTools로 name 레코드 교체. **`tnum`(고정폭 숫자) 기능을 남긴다** — 시간·점수가 바뀔 때 글자 폭이 흔들리지 않게.
  - `bunny-digits-800.woff2`에는 `+ − × :`가 없으므로 그것을 재사용하면 안 된다. 원본 폰트를 받을 수 없으면 개발자는 CEO에게 보고하고, 임시로 `unicode-range`에 없는 기호는 시스템 글꼴로 대체되게 둔다.
  ```css
  @font-face { font-family: "MoleDigits"; src: url("fonts/mole-digits-800.woff2") format("woff2");
    font-weight: 800; font-style: normal; font-display: swap;
    unicode-range: U+0030-0039, U+002B, U+002D, U+2212, U+00D7, U+0078, U+003A, U+002E; }
  :root { --num-font: "MoleDigits", "Pretendard", system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif; }
  .num { font-family: var(--num-font); font-weight: 800; font-variant-numeric: tabular-nums; }
  ```
- `unicode-range` 덕분에 "점", "콤보" 같은 한글은 자동으로 시스템 글꼴로 나온다. 숫자와 한글 단위를 한 요소에 섞어도 된다(`1,240점` 의 `,`는 서브셋에 없으니 **천 단위 쉼표 쓰지 않는다**).
- 감점 표기는 `−`(U+2212)를 쓴다(하이픈보다 길어 잘 보임).

## 색상 토큰 (라이트/다크, hex)
공통 토큰은 블록 스택·뱀 정원·개구리 텐과 **값과 이름 동일**. 다크모드 3단 구조 그대로: `:root{라이트}` / `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {다크} }` / `:root[data-theme="dark"] {다크}`.

| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--bg` | #f4f1ea | #12141a | 페이지 배경 (공통) |
| `--panel` | #ffffff | #1b1e27 | HUD 카드, 버튼 (공통) |
| `--ink` | #1f2430 | #eceef3 | 본문 글자, 일반 점수 팝업 (공통) |
| `--muted` | #6b7280 | #9aa1ae | 라벨, 보조 글자 (공통) |
| `--grid` | #e7e2d8 | #262a35 | 카드 테두리, 시간 막대 트랙 (공통) |
| `--well` | #fbfaf7 | #161921 | 오버레이 바탕 (공통) |
| `--accent` | #e4572e | #ff7a50 | 주 버튼, 신기록, 콤보 숫자 (공통) |
| `--gold` | #f2b134 | #ffc94d | "새 기록!" 배지, 콤보 단계 배지 (공통) |
| `--time` | #3f9d5a | #5cc27a | 시간 막대 (개구리 텐과 같음) |
| `--danger` | #d64545 | #ff6b6b | 마지막 10초, 폭탄 감점 팝업, 폭탄 맞을 때 판 테두리 |
| `--lawn` | #dfe7d6 | #18201b | 판 바탕 (옅은 세이지 잔디, 단색) |
| `--lawn-edge` | #c5d2bb | #29342c | 판 테두리 4px |
| `--mound` | #e3d3bb | #33302a | 흙 둔덕 |
| `--mound-edge` | #c9b498 | #4a443a | 둔덕 외곽선 |
| `--hole` | #9c8670 | #14120f | 구멍 (검정이 아닌 흙 갈색) |
| `--mole` | #c4ab93 | #a99079 | 일반 두더지 몸 (회갈 토프) |
| `--mole-edge` | #937a62 | #6e5a48 | 두더지 외곽선 |
| `--mole-paw` | #d8c2ab | #bba48c | 앞발 |
| `--mole-eye` | #3a2f28 | #2a211c | 점 눈, 맞은 눈 `> <` |
| `--mole-nose` | #c98a83 | #b87a73 | 코 (흐린 장밋빛) |
| `--gold-mole` | #ebcf86 | #cfb267 | 황금 두더지 몸·앞발 (연한 꿀색) |
| `--gold-edge` | #94741c | #8a6f2a | 황금 두더지 외곽선 |
| `--gold-mark` | #b07d12 | #7a5710 | 황금 두더지 이마의 별 |
| `--star` | #f2c75c | #ffd36b | 반짝이, 맞힘 별 입자 |
| `--gold-text` | #9a6a00 | #ffc94d | 황금 점수 팝업 글자 |
| `--bomb` | #5f6876 | #6f7987 | 폭탄 몸 (회청) |
| `--bomb-edge` | #474f5b | #9aa3b2 | 폭탄 외곽선·뚜껑 (다크는 밝은 선으로 실루엣 유지) |
| `--fuse` | #8b7a66 | #9a8873 | 심지 |
| `--spark` | #e4572e | #ff7a50 | 심지 불꽃 (= accent) |
| `--spark-core` | #fff3e0 | #fff3e0 | 불꽃 가운데 점 |
| `--smoke` | #b8bcc4 | #4a505c | 폭탄 맞을 때 연기 고리 |
| `--dust` | #cdbb9f | #5a5146 | 빈 구멍을 쳤을 때 흙먼지 고리 |

- 모든 그림이 DOM/SVG이므로 `fill="var(--mole)"`처럼 **CSS 변수를 그대로 쓴다** — 테마가 바뀌면 자동 반영(캔버스처럼 팔레트 캐시 불필요).
- `<meta name="theme-color" content="#e4572e">` 유지.

## 레이아웃 (PC / iPad 세로 / iPad 가로)

### 렌더 방식: DOM + 인라인 SVG (Canvas 아님)
- 이유: ① 구멍 9개뿐이라 DOM 비용이 작다. ② **구멍마다 `<button>` 하나 = 터치 영역**이라 좌표 계산 없이 `pointerdown`으로 바로 판정, 여러 손가락 동시 탭도 자연스럽다. ③ SVG `viewBox`라 칸 크기가 85~220px로 바뀌어도 선명하고, CSS 변수로 라이트/다크가 즉시 반영. ④ 버튼에 `aria-label`을 달 수 있다.
- 움직임은 **게임 루프(rAF)가 `transform`만 갱신**한다(아래 애니메이션 절). CSS transition으로 오르내림을 만들지 않는다 — 일시정지 때 멈출 수 없기 때문.

### 공통 구조 (위→아래, 한 화면 안, 스크롤 없음)
```
[← 게임 목록] 두더지 뿅뿅   [점수][콤보][최고][시간]  [🔈][Ⅱ]   ← 상단 바 52px (아이콘은 SVG)
[■■■■■■■■■■■■■■■■■■■■■■■■■■■■□□□□□□□□]                    ← 시간 막대 10px
┌──────────── 잔디 판 (정사각, 3×3) ────────────┐
│   (둔덕)      (둔덕)      (둔덕)               │
│   (둔덕)      (둔덕)      (둔덕)               │   ← 콤보 알약은 판 위쪽 가운데에 겹쳐 뜸
│   (둔덕)      (둔덕)      (둔덕)               │
└───────────────────────────────────────────────┘
```
- `.app`은 가로·세로 모두 가운데(`body { justify-content: center; align-items: center }`) — 개구리 텐과 같음.
- 상단 바 너비 `min(100%, max(판 너비, 560px))`.

### 높이 기준 레이아웃 규칙 (필수)
1. `--app-h` = `window.innerHeight + 'px'`, `resize`·`orientationchange`·`visualViewport.resize` 때 갱신. CSS 기본값 `100dvh`(미지원 `100vh`). `100vh` 단독 금지.
2. `html, body { height: var(--app-h); overflow: hidden; }`, body 패딩 `max(12px, env(safe-area-inset-*))` 네 방향, viewport meta `width=device-width, initial-scale=1, viewport-fit=cover`.
3. 고정 높이 `F = 52(상단 바) + 8 + 10(시간 막대) + 8 = 78px`. `W = innerWidth − 좌우 패딩`, `H = app-h − 상하 패딩 − F`.
4. **판은 정사각형 3×3**. 판 = 테두리 4px + 안쪽 패딩 12px + 칸 3개(칸 사이 간격 0 — 칸 전체가 터치 영역이라 죽은 틈이 없게).
   - `c = floor(min((W − 32) / 3, (H − 32) / 3, 220))`, 하한 64. 판 한 변 `S = 3c + 32`.
   - JS로 계산해 `--c`, `--bs`(= S) 변수로 넣는다. 크기가 바뀌어도 게임 상태는 그대로(위치가 모두 칸 비율이라 재계산 불필요).
5. 수치 (패딩 12px, 안전 영역 0 기준):

| 화면 | W × H(가용) | 칸 c | 판 S | 세로 여백(위·아래 각각) | 오버레이 |
|---|---|---|---|---|---|
| PC 1280×800 | 1256 × 698 | **220** | 692 | 약 3 | 판 위 |
| iPad 가로 1080×810 | 1056 × 708 | **220** | 692 | 약 8 | 판 위 |
| iPad 가로 1080×740 (Safari 주소창) | 1056 × 638 | **202** | 638 | 0 | 판 위 |
| iPad 세로 810×1080 | 786 × 978 | **220** | 692 | 약 143 | 판 위 |
| 폰 세로 390×844 | 366 × 742 | **111** | 365 | 약 188 | **화면 전체** |
| 폰 가로 844×390 | 820 × 288 | **85** | 287 | 0 | **화면 전체** |

6. **구멍 터치 영역**: 칸 하나(c × c) 전체가 버튼. 최소 c = 64px(하한), 실제 최소는 폰 가로 85px → 44px 기준의 약 2배. 판 안쪽 패딩 12px 영역 탭은 무시(가까운 칸으로 보정하지 않음 — 이웃 칸 오인 방지).
7. **작은 판의 오버레이**: `S < 420`이면 `body.ov-full` → 오버레이를 화면 전체(`position: fixed; inset: 0`)로. 개구리 텐 CSS 그대로 사용:
   ```css
   body.ov-full .overlay { position: fixed; inset: 0; border-radius: 0; z-index: 10;
     padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
              max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
   .ov-home { display: none; }
   body.ov-full .ov-home { display: inline-flex; position: absolute; margin: 0; animation: none;
     top: max(4px, env(safe-area-inset-top)); left: max(12px, env(safe-area-inset-left)); }
   ```
   - **모든 오버레이(시작·일시정지·종료) 안에 `<a class="ov-home secondary" href="../../">← 게임 목록</a>`를 넣는다** — 전체 화면 오버레이가 상단 바 링크를 덮기 때문(개구리 텐 교훈). 판 위 오버레이(iPad·PC)에서는 숨김(상단 바 링크가 보이므로).
   - `.board`와 그 조상(`.app`, `.board-wrap`)에 `transform`/`filter` 금지(`fixed`가 깨짐). 폭탄 흔들림 등은 칸 안 SVG 그룹에만 건다.
   - `@media (max-height: 520px)`: 오버레이 제목 20px, 범례 아이콘 36px, 범례를 한 줄 가로 배치, 조작 안내 숨김 — 폰 가로 390px 높이에 "시작하기"가 화면 안에 들어오게.
8. **검증 기준** (QA와 공유): 위 6개 뷰포트 모두 `scrollHeight ≤ innerHeight`, `scrollWidth ≤ innerWidth`, 판 `getBoundingClientRect().bottom ≤ innerHeight − 4`, 판 너비 = 높이(±1px), 칸 버튼 크기 ≥ 64px. 390×844·844×390에서 시작 오버레이가 화면 전체를 덮고 "시작하기"와 "← 게임 목록"이 화면 안에 보임. 810×1080에서 판이 세로 가운데(여백 차 ≤ 2px).

### 상단 바 반응형
| 너비 조건 | 변화 |
|---|---|
| 상단 바 너비 < 640px | 제목 "두더지 뿅뿅" 숨김 |
| < 560px | "← 게임 목록" → "← 목록", 카드 패딩 4px 8px, 최소 너비 52px |
| < 420px | `최고` 카드 숨김(최고 점수는 시작·종료 오버레이에 표시) |
- 폰 세로 390 계산: 링크 약 58 + 카드 3개 약 170 + 버튼 2개 94 + 간격 ≈ 346 ≤ 366. 버튼 44×44 유지.

### 판
- `.board`: 크기 `S × S`, 테두리 `4px solid var(--lawn-edge)`, `border-radius: 16px`, 배경 `--lawn` 단색, 안쪽 패딩 12px, `display: grid; grid-template-columns: repeat(3, var(--c)); grid-template-rows: repeat(3, var(--c));`.
- 판·칸에 체크무늬·잔디 결·풀잎 장식 없음.

### "← 게임 목록" 링크
- 개구리 텐과 동일: 14px `--muted`, `min-height: 44px; display: inline-flex; align-items: center; padding: 0 8px; margin-left: -8px`, hover/focus `--ink`, `href="../../"`, 게임 중 눌러도 확인창 없이 이동.

## 칸(구멍)·두더지 그리기 — 인라인 SVG
각 칸 = `<button class="hole" aria-label="구멍 N">` 안에 `<svg viewBox="0 0 100 100" width="100%" height="100%">` 하나. 좌표는 모두 viewBox 단위(칸의 %)다. JS가 9칸을 같은 템플릿으로 만든다(clipPath id는 칸마다 `hc0`~`hc8`로 고유하게).

### 그리는 순서 (아래 → 위)
```
 0 ┌──────────────────────────┐
   │              ✦           │  반짝이(황금만) (80,24)
24 │       ╭──────╮           │  몸: rect x27 y24 w46 h62 rx23 (둥근 콩)
   │       │ •  • │           │  눈 (41,43) (59,43) r2.4
   │       │  ●   │           │  코 (50,51) 4.2×3
   │     ◖ │      │ ◗         │  앞발 (37,70) (63,70) 6×3.6
72 │  ╭────(  구멍  )────╮     │  구멍 ellipse (50,72) 31×9
   │ (      흙 둔덕       )    │  둔덕 ellipse (50,76) 44×15
100└──────────────────────────┘
```
1. **둔덕**: `<ellipse cx="50" cy="76" rx="44" ry="15" fill="var(--mound)" stroke="var(--mound-edge)">`
2. **구멍**: `<ellipse cx="50" cy="72" rx="31" ry="9" fill="var(--hole)">` (외곽선 없음)
3. **등장물 레이어**: `<g clip-path="url(#hcN)"><g class="actor" style="transform: translateY(…)">…</g></g>`
   - clipPath(`clipPathUnits` 기본 userSpaceOnUse): `<rect x="0" y="0" width="100" height="72"/>` + `<ellipse cx="50" cy="72" rx="31" ry="9"/>` → 구멍 윗선 위쪽 전체 + 구멍 안쪽. 그래서 등장물이 구멍 속에서 솟아오르는 것처럼 보이고, 아래쪽 흙 둔덕을 덮지 않는다.
   - `.actor` 안에 세 종류 그룹(`.k-mole`, `.k-gold`, `.k-bomb`)을 모두 두고 `hidden`/`display`로 하나만 보인다.
- **외곽선 굵기**: 모든 `stroke` 요소에 `stroke-width: 1.5px; vector-effect: non-scaling-stroke;` → 칸 크기와 무관하게 화면에서 1.5px. (심지·맞은 눈 같은 선 그림은 viewBox 단위로 굵기를 주어 함께 커지게 — 아래 값.)

### 일반 두더지 `.k-mole`
| 요소 | SVG | 색 |
|---|---|---|
| 몸 | `<rect x="27" y="24" width="46" height="62" rx="23">` | fill `--mole`, stroke `--mole-edge` |
| 눈 2 | `<circle cx="41" cy="43" r="2.4">`, `<circle cx="59" cy="43" r="2.4">` | `--mole-eye` |
| 코 | `<ellipse cx="50" cy="51" rx="4.2" ry="3">` | `--mole-nose` |
| 앞발 2 | `<ellipse cx="37" cy="70" rx="6" ry="3.6">`, `<ellipse cx="63" cy="70" rx="6" ry="3.6">` | fill `--mole-paw`, stroke `--mole-edge` |
- 귀·입·볼·수염·이빨·모자·헬멧 없음. 앞발은 구멍 가장자리에 걸친 느낌.
- **맞은 얼굴** (`.actor.hit`): 점 눈 대신 `> <` 모양 — `<path d="M38 40.5 l5 2.5 l-5 2.5 M62 40.5 l-5 2.5 l5 2.5" fill="none" stroke="var(--mole-eye)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">`. 코는 그대로.

### 황금 두더지 `.k-gold` — 일반과 같은 실루엣 + 별 표식
- 몸·앞발: 같은 도형, fill `--gold-mole`, stroke `--gold-edge`. 눈·코·맞은 얼굴은 일반과 같음.
- **이마 별 (모양 구분)**: `<path d="M50 27.5 L51.6 31 L55.2 31.3 L52.5 33.7 L53.3 37.3 L50 35.4 L46.7 37.3 L47.5 33.7 L44.8 31.3 L48.4 31 Z" fill="var(--gold-mark)">`
- **반짝이 (모양 구분)**: 몸 오른쪽 위 4각 별 `<path d="M80 18 L81.4 22.6 L86 24 L81.4 25.4 L80 30 L78.6 25.4 L74 24 L78.6 22.6 Z" fill="var(--star)">` — 천천히 반짝임(애니메이션 절).

### 폭탄 `.k-bomb` — 두더지가 아닌 물체 (판단: 폭탄 오브젝트)
- 이유: 두더지에 폭탄 표시만 붙이면 "잡아도 되는 두더지"와 헷갈린다. **둥근 공 + 심지 + 불꽃**은 얼굴이 없고 윤곽부터 달라 반쯤 올라온 순간에도(심지가 먼저 보임) 구분된다. 색약이어도 모양으로 구분된다.

| 요소 | SVG | 색 |
|---|---|---|
| 심지 | `<path d="M53 26 q3 -7 10 -8.5" fill="none" stroke-width="2.4" stroke-linecap="round">` | stroke `--fuse` |
| 뚜껑 | `<rect x="44" y="25" width="12" height="7" rx="2">` | `--bomb-edge` |
| 몸 | `<circle cx="50" cy="52" r="21">` | fill `--bomb`, stroke `--bomb-edge` |
| 불꽃 | 4각 별 `<path d="M64 11.5 L65.6 15.9 L70 17.5 L65.6 19.1 L64 23.5 L62.4 19.1 L58 17.5 L62.4 15.9 Z">` + 가운데 `<circle cx="64" cy="17.5" r="1.6">` | `--spark` / `--spark-core` |
- 얼굴·눈·해골·느낌표·줄무늬 없음. 광택 하이라이트 없음.

### 빈 칸
- 둔덕 + 구멍만. 대기 애니메이션 없음(조용한 판).

## HUD·메뉴·오버레이

### 상단 바 HUD
- 개구리 텐 `.card`와 같은 카드: 배경 `--panel`, 테두리 1px `--grid`, radius 10px, 패딩 4px 12px, 최소 너비 64px, 최대 높이 48px.
- 라벨 11px 600 `--muted` 자간 .08em: `점수`, `콤보`, `최고`, `시간`. 값 20px `.num`(MoleDigits 800) `--ink`.
  - 점수: `1240` (쉼표 없음). 최고 점수가 이번 판에 갱신되는 순간부터 `최고` 카드 값 색 `--accent`.
  - 콤보: `×N` (N = 현재 연속 횟수, 0이면 `×0`을 `--muted` 색으로). N ≥ 1이면 숫자 색 `--accent`. HUD 카드는 항상 **연속 횟수**를 보여 준다. design.md에 점수 배율이 있으면 배율은 판 위 콤보 알약에만 표시.
  - 시간: 남은 초 정수 `45` (단위 글자 없음, `:` 쓰지 않음 — 60초 이하 게임이면). 마지막 10초는 `--danger` + pulse.
- 버튼 2개(음소거·일시정지) 44×44, 개구리 텐과 같은 SVG 아이콘·`aria-label`(`소리 끄기/켜기`, `일시정지/계속하기`).

### 시간 막대
- 개구리 텐과 동일: 높이 10px, 너비 = 판 너비, radius 999px, 트랙 `--grid`, 채움 `--time`, `transform: scaleX(남은비율)`(origin left). `role="progressbar"`, `aria-valuemin/max/now`(초).
- 마지막 10초: 채움 `--danger` + 사선 줄무늬(개구리 텐 CSS 그대로), 판 테두리 → `--danger` 300ms 전환. 화면 전체 깜빡임 없음.

### 판 위 콤보 알약
- 콤보 N ≥ 3일 때만 표시. 위치: 판 위쪽 가운데, 판 테두리에 반쯤 걸치게(`top: -14px`, 판 기준 absolute, `pointer-events: none`, z-index 4).
- 높이 30px, 패딩 0 12px, radius 999px, 배경 `--panel`, 테두리 1px `--grid`. 내용 `콤보 ×N` — "콤보" 13px 700 `--muted`, `×N` 18px `.num` `--accent`. 배율이 있으면 `콤보 ×N · 점수 ×1.5`.
- 단계(5, 10, 15 … 또는 design.md 배율이 오르는 순간): 배경을 `--gold`, 글자 `#1f2430`으로 400ms 동안 바꾼 뒤 원래대로.
- 콤보가 끊기면 알약 페이드 아웃 200ms.

### 오버레이 (판 위 / 작은 화면은 전체 화면)
- 공통: 개구리 텐과 같음 — 배경 `color-mix(in srgb, var(--well) 84%, transparent)`, 세로 스택 gap 10px 가운데, 제목 24px 800, 본문 14px `--muted`, 주 버튼 `button.primary`(`--accent`, 흰 글자 700, 높이 48px, 18px), 보조 버튼 `.secondary` 44px. 시작 오버레이 배경은 `--lawn` 단색, 일시정지 `--well` 97%.
- 모든 오버레이에 `.ov-home` 링크(전체 화면일 때만 보임, 위 레이아웃 7번).

| 오버레이 | 내용 |
|---|---|
| 시작 | 제목 "두더지 뿅뿅", 한 줄 "올라오는 두더지를 톡! 폭탄은 건드리지 마세요", **범례** 가로 3칸: 각 칸 = 48px 미니 SVG(칸 그림과 같은 도형, 둔덕 포함 정지 상태) + 아래 값 `.num` 15px — 두더지 `+10`(`--ink`), 황금 두더지 `+50`(`--gold-text`), 폭탄 `−20`(`--danger`), 각 값 아래 이름 12px `--muted`("두더지", "황금 두더지", "폭탄"). 그 아래 "제한 시간 60초 · 연속으로 맞히면 콤보" 13px, `최고 N점`, 주 버튼 "시작하기", 조작 안내 12px `--muted` (터치: "구멍을 톡 치세요", PC: "클릭 또는 숫자패드 1–9 · Space 일시정지"). 뒤로 빈 둔덕 9개가 보인다. |
| 일시정지 | 제목 "일시정지", 주 버튼 "계속하기", 보조 버튼 "처음부터". 일시정지 중 등장물은 그 자리에 멈춰 보인다(오버레이 97%라 거의 가려짐 — 몰래 보기 방지). |
| 시간 종료 | 신기록이면 제목 위에 배지 "새 기록!"(`--gold` 배경, `#1f2430` 12px 800, radius 999px, 패딩 4px 10px). 제목 "시간 끝!", 점수 44px `.num` + "점" 18px 700, 그 아래 14px `--muted` 한 줄 "잡은 두더지 N · 최대 콤보 ×N · 최고 N점". 주 버튼 "다시 하기", 보조 `.secondary` "← 게임 목록"(판 위 오버레이에서도 보임, 전체 화면에서는 `.ov-home`과 중복되므로 `.ov-home` 대신 이것 하나만 보이게 해도 됨). 표시 후 0.5초 동안 버튼 `disabled`(opacity .5). |

- 숫자 값(+10/+50/−20, 60초)은 design.md 값으로 채운다.

## 애니메이션·이펙트 (지속시간 ms, easing)
- **등장물 오르내림은 게임 루프가 계산**: 칸마다 상태(`rising`/`up`/`sinking`/`hit`)와 경과 ms를 갖고, 매 프레임 `.actor`에 `transform: translateY(Ypx)`(viewBox 단위 → `Y × c / 100`px) 또는 SVG `transform="translate(0 Y)"`를 쓴다. 일시정지면 경과 시간도 멈춘다.
- 숨은 위치 `Y = 70`(viewBox 단위, 모든 종류 공통 — 불꽃 꼭대기까지 구멍 아래로 숨음), 올라온 위치 `Y = 0`.
- 효과(별·팝업·고리)는 **Web Animations API**(`el.animate`)로 만들고, 일시정지 때 `document.getAnimations().forEach(a => a.pause())`, 재개 때 `play()`.

| 이펙트 | 내용 | 시간 | easing |
|---|---|---|---|
| 판 등장 (게임 시작) | 둔덕 9개 opacity 0→1, scale .92→1 (칸 중심), 칸마다 30ms 지연 | 각 220, 전체 ≤ 460 | ease-out |
| 올라오기 | Y 70 → 0, 끝에서 살짝 넘침(easeOutBack, s = 1.2 → 최대 약 −4) | 110 (v2, 이전 150) | easeOutBack |
| 올라온 대기 | 움직임 없음(조용함). 황금 반짝이만 scale .8↔1.1 + opacity .6↔1 | 반짝이 주기 900 반복 | sine |
| 폭탄 불꽃 | 불꽃만 scale .85↔1.1 + 회전 0↔15° (깜빡임 아님) | 주기 500 반복 | sine |
| 들어가기 (놓침) | Y 0 → 70 | 120 (v2, 이전 160) | easeInCubic |
| **맞음: 두더지** | ① 0–80: 눈 `> <`로 교체, 몸 눌림 — `.actor` 안 몸 그룹 scaleX 1→1.08, scaleY 1→.88(기준점 몸 바닥 (50,86))<br>② 80–260: Y 0 → 70 (`> <` 유지), 눌림 복귀 | 260 | ① easeOutCubic ② easeInCubic |
| 맞음: 별 입자 | 머리 위 (50, 26) 기준, 4각 별 3개(황금은 5개, 크기 1.3배) — 반지름 r=4(viewBox) `--star`. 방향 −90°±50° 부채꼴로 고르게, 거리 0 → 22, scale 1 → .4, opacity 1 → 0. 회전 0→60° | 420 | easeOutCubic |
| 점수 팝업 | 칸 위쪽 가운데에 `+10` — `.num` 칸 크기 비례 `max(18px, .13c)`(c=220 → 28px), 색 `--ink`, `--panel` 색 외곽선(`-webkit-text-stroke: 6px var(--panel); paint-order: stroke fill;` → 바깥 3px만 보임, text-shadow 쓰지 않음). 위로 `.18c` 이동, opacity 1→0(마지막 40%만) | 650 | ease-out |
| 황금 팝업 | `+50` 색 `--gold-text`, 크기 1.2배, 시작 시 scale .8→1.1→1 (앞 160ms) | 750 | ease-out |
| HUD 점수 | 값 scale 1→1.15→1 | 160 | ease-out |
| 콤보 증가 | HUD 콤보 값·판 위 알약 scale 1→1.12→1 | 160 | ease-out |
| **맞음: 폭탄** | ① 0–180: 폭탄 좌우 흔들림 translateX ±3 → ±2 → ±1(viewBox), 불꽃 숨김<br>② 120–420: 연기 고리 — 원(채움 없음) 중심 (50,52), r 18 → 34, stroke `--smoke` 3(viewBox), opacity .7 → 0<br>③ 180–360: Y 0 → 70 | 420 | ① linear ② easeOutCubic ③ easeInCubic |
| 폭탄 감점 팝업 | `−20` 색 `--danger`, 위 점수 팝업과 같은 크기·움직임 | 650 | ease-out |
| 폭탄 판 경고 | 판 테두리 색 `--lawn-edge` → `--danger` → 원래 (판 흔들림·화면 깜빡임 없음) | 300 | ease-out |
| 콤보 끊김 | HUD 콤보 값 `×0`으로 바뀌며 색 `--muted`, translateX ±3px 2회 | 200 | linear |
| 빈 구멍 탭 (헛손질) | 구멍 위 흙먼지 고리 — 타원(채움 없음) (50,72), rx 20→34, ry 6→10, stroke `--dust` 2, opacity .6→0 | 220 | ease-out |
| 탭 위치 표시 (공통) | 누른 지점에 원 지름 0→36px, 테두리 2px `--ink` alpha .25 → 0 (손가락 반응 확인용, 판 위 absolute) | 200 | ease-out |
| 시간 종료 | 입력 중지 → 올라와 있던 등장물 전부 Y → 70 (160ms, easeInCubic) → 300ms 뒤 오버레이 | ~460 | — |
| 오버레이 | opacity 0→1, 내용 translateY 8px → 0 | 200 | ease-out |
| 버튼 눌림 | scale .94, 배경 `--grid` (칸 버튼 `.hole`에는 적용 안 함 — 칸이 줄어들면 오히려 어지러움) | 80 | ease-out |

- easeOutBack: `1 + (s+1)(t−1)^3 + s(t−1)^2`, s = 1.2.
- 판정·점수는 `pointerdown` 순간 즉시 확정, 이펙트는 보여주기만(효과 목록 분리).
- 한 칸에서 맞음 이펙트가 끝나기 전에 같은 칸에 새 등장물이 나오지 않게 하는 것은 design.md 규칙(최소 간격)을 따른다. 시각적으로는 맞음 260ms(폭탄 420ms)가 끝나야 다음 올라오기가 보기 좋다.
- **`prefers-reduced-motion: reduce`**: 올라오기·들어가기를 110/120ms → **90ms linear**(넘침 없음 — 게임 판단에 위치 변화는 필요), 판 등장·눌림·흔들림·별 입자·연기 고리·흙먼지·탭 위치·반짝이·불꽃 회전·pulse 끔. 팝업은 이동 없이 opacity 1→0 500ms만. `> <` 맞은 얼굴은 유지(정보이므로).

## 조작 UI (터치 버튼 크기 ≥ 44px, 제스처, 키 매핑)

### 터치 / 마우스
- 칸 9개는 `<button class="hole" type="button" aria-label="구멍 1">` (번호 순서: 왼쪽 위 1 → 오른쪽 아래 9, 읽는 순서). 크기 c × c(최소 64, 실제 85~220px).
- **`pointerdown`에서 판정**(click 아님 — 300ms 지연·탭 놓침 방지). `e.preventDefault()`.
- **여러 손가락 동시 탭 허용**: 칸마다 독립 처리, 포인터 캡처 없음, 첫 포인터만 받는 제한 없음. 같은 포인터가 칸 사이를 미끄러져도 추가 판정 없음(누르는 순간 1회).
- 판(`.board`)과 칸: `touch-action: none` (두 손가락 확대·스크롤 차단). 칸 `:active` 스타일 없음, `-webkit-tap-highlight-color: transparent`.
- PC 마우스: 칸 위 `cursor: pointer`. 커스텀 커서(망치 등) 없음.
- `contextmenu` 이벤트 막기(길게 누르기 메뉴 방지), `-webkit-touch-callout: none`.

### 키보드 (PC)
| 키 | 동작 |
|---|---|
| 숫자패드 `7 8 9 / 4 5 6 / 1 2 3` | 화면 배치 그대로 칸 치기 (`e.code` `Numpad7` 등 → 위 줄이 7·8·9) |
| `Q W E / A S D / Z X C` | 같은 3×3 배치(숫자패드 없는 노트북용) |
| 위 숫자 키 `1`–`9` (`Digit1`…) | 읽는 순서 1(왼쪽 위)…9(오른쪽 아래) |
| Space · P · Esc | 일시정지 / 계속 |
| Enter | 시작 · 다시 하기 (오버레이 주 버튼) |
| M | 소리 켜기/끄기 |
- 키를 누르면 해당 칸에 탭 위치 표시 효과를 칸 중심에 보여 준다. 키 반복(`e.repeat`)은 무시.
- 시작 오버레이 안내 문구는 `(pointer: fine)`일 때 키 안내, `(pointer: coarse)`일 때 터치 안내.

### iPad Safari 공통
- `body { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; }` (개구리 텐과 같음), 판은 `touch-action: none`.
- 더블탭 확대 방지: 위 `touch-action` + viewport meta에 `maximum-scale`은 넣지 않는다(접근성). `dblclick`/`gesturestart` `preventDefault`.
- 가로 스크롤 금지(`overflow: hidden`, 판 크기 식이 너비도 제한). 안전 영역 패딩.
- `blur`·`visibilitychange`(숨김) 때 자동 일시정지.

## 접근성 (대비, 색 외 구분 수단)
- **종류 구분은 모양이 1순위**: 일반 = 무늬 없는 두더지, 황금 = 이마 별 + 옆 반짝이, 폭탄 = 얼굴 없는 공 + 심지 + 불꽃. 색만 바꾼 변형 없음. 맞은 두더지는 `> <` 눈으로, 폭탄 감점은 `−` 기호 + 연기 고리로도 표시.
- **대비 (WCAG 상대 휘도, 실측)**:
  - 눈 대 두더지 몸: 라이트 5.9:1, 다크 5.2:1.
  - 두더지 외곽선 대 판: 라이트 3.2:1(몸 자체는 1.7:1 — 눈 피로 원칙으로 낮게, 외곽선이 실루엣 담당). 다크는 몸 대 판 5.5:1.
  - 황금: 몸 대 판 라이트 1.2:1 → **외곽선 #94741c 3.5:1**이 실루엣 담당, 이마 별 대 몸 2.4:1(모양 보조). 다크 몸 대 판 8.1:1.
  - 폭탄 대 판: 라이트 4.4:1, 다크 3.8:1(다크 폭탄 대 두더지 1.5:1이지만 모양·색상(회청 vs 갈색)으로 구분).
  - 팝업 글자 대 `--panel` 외곽선 기준: `--ink` 15.5:1, `--gold-text` 라이트 4.7:1 / 다크 10.9:1, `--danger` 라이트 4.4:1 / 다크 6.0:1 (모두 18px 이상 굵은 큰 글자 → 3:1 기준 충족).
- **외곽선을 굵게·진하게 바꾸지 말 것, 판에 무늬를 넣지 말 것**(사용자 "눈이 아프다" 이력).
- 깜빡임: 화면 전체·넓은 영역 깜빡임 없음. 불꽃·반짝이는 작은 크기의 크기·회전 변화(밝기 점멸 아님).
- 포커스 링 `outline: 3px solid var(--accent); outline-offset: 2px` (버튼·링크). 칸 버튼은 키보드 Tab 순서에서 제외(`tabindex="-1"`) — 키보드는 숫자패드/QWE 매핑을 쓰므로 Tab은 상단 버튼·오버레이 버튼만.
- 오버레이 열릴 때 주 버튼 `focus()`.
- `aria-live="polite"` 영역: 시간 종료 "시간 끝. 1240점, 최고 1500점", 남은 10초 1회. 매 탭마다 읽지 않는다(너무 많음).
- 판 `role="group" aria-label="두더지 뿅뿅 게임 판"`.

## 시안 (스크래치, 저장소 밖)
- 칸 그림 시안(라이트/다크: 일반·황금·폭탄 올라온 상태, 맞은 얼굴, 반쯤 올라온 상태, 빈 구멍)과 목록 카드 아이콘(라이트/다크 타일, 작은 크기)을 Chromium으로 렌더해 확인했다: 반쯤 올라온 폭탄은 심지·불꽃이 먼저 보여 두더지와 바로 구분됨, 황금은 별 표식으로 색 없이도 구분됨, 구멍 clipPath로 구멍 속에서 솟는 모양이 자연스러움. 실제 iPad Safari 표시는 미검증.

## 변경 이력
| 날짜 | 버전 | 내용 |
|---|---|---|
| 2026-11-13 | v1 | 최초 명세: DOM+SVG, 3×3 잔디 판, 콩 모양 두더지(점 눈 2 + 코), 황금(이마 별·반짝이), 폭탄 오브젝트(심지·불꽃), MoleDigits 숫자 서브셋, `ov-full` + 오버레이 안 목록 링크 |

- 2026-11-13 v2 (사용자 "너무 쉽고 지루하다" → 밸런스 조정): 올라오기 150→110ms, 들어가기 160→120ms (design.md v2 판정 시간과 일치).
