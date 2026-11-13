# 게임 목록(첫 페이지) 아트·UI 명세

> 대상: `/index.html`. 사용자 요구: "첫 페이지는 각 게임 목록이 보이게, 각 게임에 맞는 아이콘을 누르면 세부 게임 페이지로 이동".
> 현재: 이모지(🧱) 카드 1개. → 게임마다 인라인 SVG 아이콘을 큰 타일로 보여주는 카드 그리드로 바꾼다.

## 스타일 콘셉트
- 지금의 따뜻한 종이색 배경 + 흰 카드 + 주황 강조 분위기 유지. 카드 위쪽 절반 이상을 **게임별 색 타일 + 큰 SVG 아이콘**이 차지해, 글을 읽지 않아도 아이콘만 보고 고를 수 있게.
- 아이콘은 플랫·둥근 모서리, 실제 게임 화면 색을 그대로 써서 들어가면 같은 게임처럼 느껴지게.

## 색상 토큰 (라이트/다크, hex)
기존 토큰(`--bg --panel --ink --muted --line --accent`)과 다크모드 3단 구조는 그대로. 아이콘 타일 배경 토큰만 추가:

| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--tile-block` | #fdebe3 | #2a1f1b | 블록 스택 아이콘 타일 배경 (주황 기운) |
| `--tile-snake` | #e4f0d6 | #18241c | 뱀 정원 아이콘 타일 배경 (풀색, 게임 `--tile-a` 계열) |

- 아이콘 안의 도형 색은 라이트/다크 공통(게임 속 색과 동일)으로 두되, 다크에서 너무 어두운 테두리가 없도록 아래 지정 색만 사용.

## 레이아웃 (PC / iPad 세로 / iPad 가로 / 폰)
```
나의 게임 스튜디오
하고 싶은 게임을 골라보세요.

┌───────────┐ ┌───────────┐ ┌───────────┐
│ ▓▓ 아이콘 ▓▓│ │ ▓▓ 아이콘 ▓▓│ │           │
│  (4:3 타일) │ │           │ │           │
│ 뱀 정원     │ │ 블록 스택   │ │           │
│ 한 줄 설명  │ │ 한 줄 설명  │ │           │
└───────────┘ └───────────┘
```
- `main { max-width: 960px; margin: 0 auto; }`, body 패딩 `32px max(16px, env(safe-area-inset-left/right))`, viewport meta에 `viewport-fit=cover`.
- 그리드: `display: grid; gap: 16px;` 열 수는 너비 구간으로 고정 (auto-fill 대신 명시 — 열 수 예측 가능):

| 뷰포트 너비 | 열 | 예 |
|---|---|---|
| < 360px | 1 | 작은 폰 |
| 360 ~ 639px | 2 | 폰 세로 (390 → 카드 약 171px) |
| 640 ~ 1023px | 3 | iPad 세로 810 → 카드 약 243px |
| ≥ 1024px | 3 | iPad 가로 1080, PC (max-width 960 안에서 3열, 카드 약 309px) |

- `grid-template-columns: repeat(N, minmax(0, 1fr))`. 게임이 2개뿐이라 3열에서 칸 하나가 비어도 왼쪽 정렬로 둔다(가운데 정렬·늘이기 금지 — 게임이 늘어도 모양 유지).
- 가로 스크롤 없음. 제목 28px(폰 < 360px은 24px).
- 새 게임은 그리드 **맨 앞**에 추가(최신 순). 현재 순서: 뱀 정원, 블록 스택.

## 카드 구조 (카드 전체가 링크)
```html
<a class="game" href="games/snake-garden/" aria-label="뱀 정원 — 정원을 기어 다니며 열매를 먹고 몸이 길어지는 뱀 게임">
  <div class="art" style="--tile: var(--tile-snake)">
    <svg viewBox="0 0 64 64" aria-hidden="true">…</svg>
  </div>
  <h2>뱀 정원</h2>
  <p>정원을 기어 다니며 열매를 먹고 몸이 길어지는 뱀 게임</p>
</a>
```
- `.game`: `display:flex; flex-direction:column;` 배경 `--panel`, 테두리 1px `--line`, radius 16px, 패딩 12px 12px 16px, 글자색 inherit, 밑줄 없음. 카드 전체가 하나의 `<a>` — 안에 다른 링크/버튼 금지.
- `.art`: `aspect-ratio: 4 / 3; background: var(--tile); border-radius: 12px; display:grid; place-items:center;` SVG는 `width: 62%; height: auto; max-height: 82%`.
- `h2`: margin 12px 4px 4px, 18px 700 `--ink`(폰 2열에서는 16px).
- `p`: margin 0 4px, 14px `--muted`, line-height 1.5, 2줄 넘으면 말줄임(`-webkit-line-clamp: 2`), 폰 2열에서 13px.
- 터치 타깃: 카드 최소 크기는 폰 2열에서도 약 171×220px → 44px 기준 충분. 카드 사이 간격 16px로 오터치 방지.

## HUD·메뉴·오버레이
- 해당 없음(목록 페이지). 헤더는 제목 "나의 게임 **스튜디오**"(스튜디오만 `--accent`)와 부제 그대로.

## 아이콘 SVG (viewBox 0 0 64 64, 좌표 그대로 그리면 됨)

### 블록 스택 — 블록이 계단처럼 쌓인 모양
블록 스택 게임 조각 색 그대로. 칸 크기 12, 블록 크기 11(1px 틈), 모서리 `rx="2.5"`.
- 구성: 바닥 줄은 청록 I 블록 4칸, 왼쪽 위는 노랑 O 블록 2×2, 가운데 보라 1칸, 오른쪽 주황 2칸 세로, 맨 위에 빨강 2칸이 떨어지는 중.
- 블록 목록(구현용, `<rect width="11" height="11" rx="2.5">`):

| x | y | fill |
|---|---|---|
| 8 | 46 | #3aa6b9 |
| 20 | 46 | #3aa6b9 |
| 32 | 46 | #3aa6b9 |
| 44 | 46 | #3aa6b9 |
| 8 | 34 | #f2b134 |
| 20 | 34 | #f2b134 |
| 8 | 22 | #f2b134 |
| 20 | 22 | #f2b134 |
| 32 | 34 | #8e6fd8 |
| 44 | 34 | #e88a3a |
| 44 | 22 | #e88a3a |
| 26 | 4 | #e4572e |
| 38 | 4 | #e4572e |

- 떨어지는 빨강 조각 아래 빈 칸 쪽으로 낙하 표시선: `<line x1="37.5" y1="17" x2="37.5" y2="21" stroke="#e4572e" stroke-width="2" stroke-linecap="round" opacity=".45"/>`
- 각 블록 위쪽에 하이라이트 줄(선택): `<rect x="+2" y="+2" width="7" height="2" rx="1" fill="#fff" opacity=".35">`.

### 뱀 정원 — S자로 기어가는 뱀 + 산딸기
게임 속 색(`#3f9d5a` 몸, `#2f8049` 머리, `#8fd19e` 무늬, `#e0374f` 산딸기)과 동일.
- 몸: `<path d="M12 50 C 12 38, 30 40, 30 30 S 46 18, 46 14" fill="none" stroke="#3f9d5a" stroke-width="9" stroke-linecap="round"/>` (왼쪽 아래 꼬리에서 S자로 올라가 오른쪽 위 머리로)
- 꼬리 가늘게: 위 path 시작부를 덮어 `<path d="M8 54 L12 50" stroke="#3f9d5a" stroke-width="5" stroke-linecap="round"/>`
- 무늬 점: 원 r=1.8 `#8fd19e` at (16,43) (27,35) (36,25)
- 머리: `<circle cx="47" cy="13" r="7" fill="#2f8049"/>`
- 눈: 흰자 `<circle r="2.2" fill="#fff">` at (44.5,10.5)와 (50,12); 눈동자 `<circle r="1.1" fill="#1f2430">` at (45,10) (50.6,11.6)
- 혀: `<path d="M53 8 l3 -2 m-3 2 l3.4 0.6" stroke="#e4572e" stroke-width="1.4" stroke-linecap="round"/>` (머리 오른쪽 위로 갈래)
- 산딸기 (오른쪽 아래): `<circle cx="50" cy="46" r="6" fill="#e0374f"/>`, 씨 점 r=0.9 `#ffd6dc` at (48,46) (52,46.5) (50,49), 하이라이트 r=1.5 `#fff` opacity .5 at (47.6,43.6), 잎 `<ellipse cx="47.8" cy="39.6" rx="2.6" ry="1.3" transform="rotate(-25 47.8 39.6)" fill="#3f9d5a"/>`와 `<ellipse cx="52.2" cy="39.6" rx="2.6" ry="1.3" transform="rotate(25 52.2 39.6)" fill="#3f9d5a"/>`

> 새 게임 아이콘 규칙: viewBox 64×64, 바깥 6px 여백, 게임 속 실제 색 2~4가지, 선 굵기 ≥ 4(작게 보여도 형태 유지), 글자 넣지 않기.

## 애니메이션·이펙트 (지속시간 ms, easing)
| 상태 | 효과 | 시간 | easing |
|---|---|---|---|
| hover / focus-visible (PC) | 카드 `translateY(-3px)`, 테두리 `--accent`, 아이콘 SVG `scale(1.06)` | 140 | ease-out |
| 누름 `:active` (터치) | 카드 `scale(.97)`, `.art` 배경 그대로 | 80 | ease-out |
| 페이지 진입 | 카드가 순서대로 opacity 0→1, translateY 6px→0, 카드마다 40ms 지연 | 220 | ease-out |
- `@media (hover: hover)`일 때만 hover 효과 적용(iPad에서 hover가 눌린 채 남는 문제 방지).
- `prefers-reduced-motion: reduce`: 진입 애니메이션·scale 끔, 테두리 색 변화만.

## 조작 UI
- 카드 전체 탭/클릭 → `href`로 이동. 키보드 Tab으로 카드 순서대로 포커스, Enter로 이동.
- `-webkit-tap-highlight-color: transparent` 후 `:active` 스타일로 눌림 피드백 대체. `touch-action: manipulation`(더블탭 확대 지연 제거).
- 텍스트 선택 방지는 카드에만 `user-select: none`(페이지 전체에는 걸지 않음).

## 접근성 (대비, 색 외 구분 수단)
- 아이콘 SVG는 `aria-hidden="true"`, 카드 `<a>`에 게임 이름이 `h2`로 들어 있어 링크 이름이 됨(필요 시 위 예시처럼 `aria-label`로 이름+설명).
- 포커스 링: `outline: 3px solid var(--accent); outline-offset: 3px; border-radius: 16px`.
- `--muted` 설명 글자 대 `--panel` 대비 4.5:1 이상(기존 토큰 유지). 게임 구분은 색이 아닌 **아이콘 모양(블록 vs 뱀) + 이름 글자**로.
