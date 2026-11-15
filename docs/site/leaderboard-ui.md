# 사이트 공통 순위표 아트·UI 명세

> 대상: 똥비 피하기(poop-rain), 두더지 뿅뿅(mole-pop), 개구리 텐(bunny-ten), 뱀 정원(snake-garden), 블록 스택(block-stack), 박자 앵무새(parrot-beat), 홈(`/index.html`). 붕어빵 눈싸움 제외.
> 규칙·제출 조건·상위 몇 명인지 등은 `docs/site/leaderboard.md`(기획)가 우선한다. 이 문서는 모양·배치·조작만 정한다.
> 구현 전제: 공통 스크립트 하나(예: `/shared/leaderboard.js`)가 CSS와 DOM을 주입한다. 게임은 "어디에 꽂을지"(앵커)만 넘긴다.

## 스타일 콘셉트
- 결과 화면을 방해하지 않는 **조용한 한 줄 칩**. 화려한 트로피·폭죽 없음. 순위가 올랐을 때만 작은 ▲ 표시.
- 순위표는 흰 카드(다크는 어두운 패널) + 얇은 구분선. 스튜디오 공통(종이색 배경, 흰 카드, 주황 강조)을 따르고, 강조색은 "내 줄" 표시에만 쓴다.
- 숫자는 각 게임의 숫자 글꼴(`--num-font`, Pretendard ExtraBold 숫자 서브셋)을 이어받는다. 글자(위·명·닉네임)는 시스템 글꼴. 홈은 숫자 글꼴을 따로 불러오지 않는다(시스템 글꼴 + `tabular-nums`).

## 색상 토큰 (라이트/다크, hex)
공통 스크립트는 `.lb` 루트에 아래 토큰을 정의한다. 값은 **게임 변수를 먼저 쓰고, 없으면 기본값**: 예 `--lb-panel: var(--panel, #ffffff)`.
다크 기본값은 `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .lb {…} }`와 `:root[data-theme="dark"] .lb {…}` 두 곳에 같은 값(기존 게임의 3단 구조와 동일).

| 토큰 | 이어받는 변수 | 라이트 기본 | 다크 기본 | 용도 |
|---|---|---|---|---|
| `--lb-panel` | `--panel` | #ffffff | #1b1e27 | 칩·시트·모달 배경 |
| `--lb-well` | `--well` / `--bg` | #fbfaf7 | #161921 | 목록 짝수 줄, 입력창 배경 |
| `--lb-ink` | `--ink` | #1f2430 | #eceef3 | 본문, 닉네임, 점수 |
| `--lb-muted` | `--muted` | #6b7280 | #9aa1ae | 보조 문구, 순위 숫자(4위~) |
| `--lb-line` | `--grid`, 없으면 `--line` | #e7e2d8 | #262a35 | 테두리, 구분선 |
| `--lb-accent` | `--accent` | #e4572e | #ff7a50 | 내 줄 왼쪽 막대, 포커스 링, 확인 버튼 (글자색으로 쓰지 않음) |
| `--lb-me-bg` | — | #fcebe5 | #2b2220 | 내 줄 배경 |
| `--lb-up` | — | #2f7d47 | #6fd08b | ▲ 상승 표시 글자 |
| `--lb-warn` | — | #8a6d3b | #d9b36c | 오프라인 문구 |
| `--lb-err` | — | #c23b3b | #ff7b7b | 실패 문구 |
| `--lb-gold` / 글자 | — | #ecd08a / #4a3708 | #c9a54e / #14161c | 1위 원 |
| `--lb-silver` / 글자 | — | #d8dce3 / #343a46 | #9aa2b0 / #14161c | 2위 원 |
| `--lb-bronze` / 글자 | — | #e6bf9c / #4f3219 | #b8896a / #14161c | 3위 원 |
| `--lb-backdrop` | — | rgba(31,36,48,.40) | rgba(0,0,0,.60) | 모달 뒤 어둡게 |
| `--lb-num` | `--num-font` | system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif | 같음 | 숫자 글꼴 |

- 블록 스택·뱀 정원·개구리 텐·홈은 `--num-font`가 없으므로 기본값(시스템) 사용. 개구리 텐의 `BunnyDigits`는 `--num-font` 변수가 없으니 게임 쪽에서 `--num-font`를 선언해 주면 이어받는다(선택).

## 레이아웃 (PC / iPad 세로 / iPad 가로 / 폰)

### (a) 결과 화면 순위 칩 `.lb-line`
```
 [ ◷ 내 순위 12위 · 87명   순위표 › ]      ← 버튼 1개 (칩 전체가 순위표 열기)
```
- `display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 999px;`
  `background: var(--lb-panel); border: 1px solid var(--lb-line); font-size: 14px; color: var(--lb-ink); max-width: 100%;`
- 숫자(12, 87)는 `<b class="lb-n">`: `font: 800 16px var(--lb-num); font-variant-numeric: tabular-nums;`
- 뒤쪽 "순위표 ›"는 `--lb-muted` 13px. 칩 너비가 260px 미만이면 "내 순위"와 "순위표" 글자를 숨기고 `12위 · 87명 ›`만.
- **콤팩트(`@media (max-height: 520px)`)**: `height: 28px; font-size: 13px; padding: 0 12px;` 숫자 14px. 터치 영역은 `::after { inset: -8px 0; }`로 44px 확보(시각 크기만 줄임).
- 칩은 결과 오버레이 안에서만 보인다. 시작·일시정지 화면에는 없음.

### (b) 닉네임 입력 시트 `.lb-nick` — **화면 위쪽에 붙는 시트** (키보드가 아래에서 올라오므로)
```
┌──────────────────────────────────┐  top: max(12px, safe-area-top)
│ 순위에 올릴 닉네임                │
│ ┌──────────────────────── 3/8 ┐ │  입력창 48px, 카운터는 입력창 안 오른쪽
│ └─────────────────────────────┘ │
│ 닉네임과 점수만 저장돼요          │  12px muted
│            [나중에]   [ 확인 ]   │  44px 버튼 2개, 확인 = accent
└──────────────────────────────────┘
```
- 폭 `min(400px, 100vw - 24px - 안전영역 좌우)`, 가운데 정렬, `position: fixed; top: max(12px, env(safe-area-inset-top));`, 반경 16px, 그림자 `0 8px 24px rgba(0,0,0,.18)`.
- 키보드 대응: `visualViewport` 높이를 `--lb-vvh`로 넣고 `max-height: calc(var(--lb-vvh) - 24px); overflow-y: auto;`.
- **보이는 높이 < 260px**(폰 가로 + 키보드): 제목·안내 줄 숨김, `[입력창][확인]` 한 줄 + 오른쪽 위 "나중에" 텍스트 버튼(44px 영역). 높이 약 72px.
- 입력창: `font-size: 16px`(iOS 확대 방지 — 필수), `enterkeyhint="done"`, `autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"`, placeholder "최대 8자".
- 카운터 `3/8`: 글자 수는 `Array.from(trim된 값).length`. 8 도달 시 `--lb-ink` 굵게, 초과 입력은 막음(한글 조합 중에는 자르지 말고 `compositionend`에서 자름).
- 확인: 빈 값이면 비활성(opacity .45). 기억된 닉네임이 있으면 미리 채움. Enter = 확인, Esc = 나중에.
- 오류 문구는 안내 줄 자리에 `--lb-err`로 교체: "1~8자로 적어 주세요", "쓸 수 없는 닉네임이에요"(기획 규칙 시).

### (c) 순위표 모달 `.lb-board`
```
┌ 순위표 · 똥비 피하기 ──────────── [×] ┐  헤더 52px, 닫기 44x44
│ [똥비][두더지][개구리][뱀][블록][앵무새] │  홈에서만: 탭 줄 44px
│ ───────────────────────────────────── │
│ (1) 하늘색우산            12,340 점    │  줄 44px
│ (2) 모래                   9,870       │
│ (3) 콩                     9,020       │
│   4 별사탕왕               8,800       │
│  …                                     │  ← 이 영역만 세로 스크롤
│ ▌12 나 · 내닉네임           6,410  나   │  내 줄 강조
│  …20                                   │
│ ───────────────────────────────────── │
│ ▌134 나 · 내닉네임          1,200       │  20위 밖일 때만, 목록 밖 고정 줄
│ 87명 참여                              │  12px muted
└───────────────────────────────────────┘
```
- PC·iPad: 가운데 카드 `width: min(440px, 100vw - 24px); max-height: min(640px, 100dvh - 32px);` 반경 18px.
- 폰 세로(폭 < 480): 아래에서 올라오는 시트, `width: 100%; max-height: 88dvh; border-radius: 18px 18px 0 0; padding-bottom: env(safe-area-inset-bottom)`.
- 폰 가로(높이 ≤ 520): 가운데 카드 `max-height: calc(100dvh - 16px)`, 헤더 44px, 줄 40px(목록 줄은 누르는 대상이 아님). 342px 높이에서 목록 약 4~5줄 보임.
- 내부 구조: `display: flex; flex-direction: column;` 헤더·탭·고정 내 줄·푸터는 `flex: none`, 목록만 `flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y;`.
- 줄: `display: grid; grid-template-columns: 36px minmax(0,1fr) auto; gap: 10px; padding: 0 16px;` 닉네임 `text-overflow: ellipsis`. 점수는 오른쪽 정렬 `lb-n` 16px. 단위(점/마리)는 헤더 옆 작게 한 번만: "순위표 · 개구리 텐 (마리)".
- 1~3위: 순위 칸에 지름 26px 원(금/은/동 토큰) + 숫자. 4위부터 숫자만 `--lb-muted`.
- **내 줄**: 배경 `--lb-me-bg`, 왼쪽 3px `--lb-accent` 막대, 닉네임 앞에 "나" 작은 태그(11px, 테두리 `--lb-line`, 반경 6px). 색 + 막대 + 글자 3중 구분.
- 열릴 때 내 줄이 목록 안에 있으면 가운데로 스크롤(`scrollIntoView({block:'center'})`).
- 상태: 불러오는 중 = 회색 막대 5줄(`--lb-line`, 깜빡임 없음) / 빈 목록 = "아직 기록이 없어요. 첫 번째가 되어 보세요!" / 실패 = "순위를 불러오지 못했어요" + [다시 시도] 44px 버튼.
- 홈 탭: `role="tablist"`, 탭 높이 44px, 짧은 이름(똥비·두더지·개구리·뱀·블록·앵무새). 6개가 안 들어가면 **탭 줄만** 가로 스크롤(`overflow-x: auto; scrollbar-width: none`), 페이지 가로 스크롤은 금지. 선택 탭 = 아래 2px `--lb-accent` 선 + 굵게 + `--lb-ink`. 기본 탭 = 마지막으로 플레이한 게임(없으면 목록 첫 게임).
- 게임 안에서 열면 탭 없이 그 게임만.

### (d) 홈 진입점
- `.title-row` 오른쪽 끝(`margin-left: auto`)에 버튼 `[🏆 순위표]` — 아이콘은 인라인 SVG 트로피 18px(`currentColor`), 이모지 아님.
- `height: 44px; padding: 0 14px; border-radius: 999px; background: var(--panel); border: 1px solid var(--line); color: var(--ink); font-size: 15px; font-weight: 700;` hover/focus 시 테두리 `--accent`(카드와 동일).
- 폭 ≤ 359px: 글자 숨기고 44x44 원형 아이콘 버튼(`aria-label="순위표"`).
- 카드 그리드·카드 디자인은 바꾸지 않는다. (기획이 카드에 "내 N위"를 원하면: 카드 `p` 아래 12px muted 한 줄 "내 순위 12위", 기록 없으면 표시 안 함.)

## HUD·메뉴·오버레이

### 결과 칩 상태별 문구
| 상태 | 칩 내용 | 색/모양 | 누르면 |
|---|---|---|---|
| 올리는 중 | `기록 올리는 중…` | muted, 왼쪽 점 3개(정지 이미지 가능) | 비활성 |
| 성공 | `내 순위 12위 · 87명  순위표 ›` | 기본 | 순위표 |
| 순위 상승 | `내 순위 12위 · 87명  ▲3` | ▲3 은 `--lb-up` 굵게, 칩 테두리 `--lb-up` 1회 강조 | 순위표 |
| 1위 | `1위! · 87명  순위표 ›` | 숫자 앞 26px 금색 원 | 순위표 |
| 첫 등록(닉네임 없음) | `순위에 이름 올리기 ›` | 테두리 `--lb-accent` | 닉네임 시트 |
| 나중에 누름 | `순위 등록하기 ›` | 기본 | 닉네임 시트 |
| 오프라인 | `연결 안 됨 — 다음에 올릴게요` | `--lb-warn`, 테두리 없음 | 비활성 |
| 실패 | `못 올렸어요 · 다시` | `--lb-err` | 재시도 |
| 이번 점수 < 내 최고 | 성공과 같음(최고 기록 기준 순위) | 기본 | 순위표 |

- 첫 제출 시 닉네임 시트는 결과 화면이 뜬 뒤 **600ms 후** 자동으로 1번만 연다(결과 숫자를 먼저 보게). 이후로는 칩을 눌러야 열림.

### 레이어(z-index)
- 게임 오버레이 최대 10(`body.ov-full .overlay`), 박자 앵무새 이펙트 30. 공통 레이어는 **body 직속**에 붙이고:
  backdrop 1000 / 순위표 모달 1001 / 닉네임 시트 1002.
- 열려 있는 동안 `body.lb-open` 클래스 + `overflow: hidden`(배경 스크롤 잠금).

## 애니메이션·이펙트 (지속시간 ms, easing)
| 대상 | 동작 | 시간 | easing |
|---|---|---|---|
| 결과 칩 등장 | opacity 0→1, translateY 6→0 (오버레이 등장 후 120ms 지연) | 180 | ease-out |
| 상태 전환(올리는 중→성공) | 글자 crossfade | 140 | ease-out |
| ▲N 상승 | scale .6→1.1→1 | 260 | cubic-bezier(.2,.8,.2,1.2) |
| 순위표 열기 | backdrop 0→1, 카드 opacity + scale .98→1 (폰 세로 시트는 translateY 100%→0) | 200 / 240 | ease-out |
| 순위표 닫기 | 반대로 | 140 | ease-in |
| 닉네임 시트 | translateY -16px→0 + opacity | 200 | ease-out |
| 내 줄로 스크롤 | smooth | — | — |

- `prefers-reduced-motion: reduce`: 이동·확대 전부 제거, opacity만 120ms. 스크롤은 `behavior: 'auto'`. ▲N은 정지 표시.

## 조작 UI (터치 버튼 크기 ≥ 44px, 제스처, 키 매핑)
- 터치 대상 모두 44px 이상: 칩(콤팩트는 `::after`로 확장), 닫기 44x44, 탭 44px, 확인/나중에/다시 시도 44px.
- 모든 공통 버튼·입력: `touch-action: manipulation`. 시트·모달 루트: `user-select: none`(입력창만 `user-select: text`).
- 닫기: × 버튼, backdrop 탭, Esc. 폰 세로 시트는 아래로 끌어 닫기 **넣지 않음**(목록 스크롤과 충돌).
- 키보드: Tab 순환은 모달 안에 가둠. 탭 줄은 ←/→로 이동(roving tabindex), Home/End 지원. 닉네임 Enter = 확인, Esc = 나중에.
- **게임 입력 차단(필수)**: `.lb` 루트에서 `keydown`, `pointerdown`, `touchstart`를 `stopPropagation`. 그리고 각 게임의 전역 키/포인터 핸들러는 `document.body.classList.contains('lb-open')`이면 즉시 return.
  - 이유: Enter/Space가 결과 화면 "다시 하기"를 누르고, 두더지 뿅뿅은 문서 전체 pointerdown으로 타격을 판정함(`.overlay` 밖 탭은 게임 입력으로 처리).
- 결과 화면 기본 포커스·Enter는 계속 "다시 하기". 칩은 Tab 순서상 점수 다음, 버튼 앞.

## 접근성 (대비, 색 외 구분 수단)
- 칩: `<button type="button" class="lb-line" aria-label="내 순위 87명 중 12위. 순위표 열기">`. 올리는 중/오프라인은 `aria-disabled="true"`. 상태가 바뀌면 각 게임의 기존 `#live`(aria-live=polite)에 한 줄 전달("87명 중 12위, 3계단 올랐어요").
- 모달: `role="dialog" aria-modal="true" aria-labelledby="lb-title"`, 열면 닫기 버튼에 포커스, 닫으면 연 버튼으로 포커스 복귀. 목록은 `<ol>`, 각 줄 `aria-label="12위 내닉네임 6,410점"`, 내 줄에 `aria-current="true"`.
- 닉네임: `<label for>` 연결, 카운터 `aria-live="polite"`는 6자 이상일 때만 읽게, 오류는 `aria-describedby`.
- 탭: `role="tab" aria-selected aria-controls`.
- 포커스 링: `outline: 3px solid var(--lb-accent); outline-offset: 2px;` (`:focus-visible`).
- 대비: 본문·muted·warn·err·up 글자는 패널 배경 대비 4.5:1 이상으로 고른 값. accent는 글자색으로 쓰지 않음.
- 색 외 구분: 1~3위 = 원 안 숫자, 내 줄 = 막대 + "나" 태그, 상승 = ▲ 기호 + 숫자, 실패/오프라인 = 문구 자체.

## 게임별 삽입 위치
측정: Chromium 740x342(폰 가로)에서 결과 오버레이 내용 높이. 칩 콤팩트 = 28px + 오버레이 gap.

| 게임 | 결과 오버레이 | 앵커·방식 | 340px대 여유 → 추가 후 | 비고 |
|---|---|---|---|---|
| 똥비 피하기 | `#ovResult` | **`#resLine` 안 끝에 인라인으로 붙임**(`최고 N점 · 아슬 N번 [칩]`, 칩 `margin-left: 8px; vertical-align: middle`) | 285 / 310 → 약 293 | 별도 줄로 넣으면 321px로 넘침. 반드시 인라인. 세로 화면에선 줄바꿈되어 자연히 아래 줄 |
| 두더지 뿅뿅 | `#ovOver` | `#overStat2` 다음, `.row` 앞에 별도 줄 | 218 / 310 → 252 | 문서 전체 pointerdown 타격 판정 → `lb-open` 무시 처리 필수 |
| 개구리 텐 | `#ovOver` | `#overBest` 다음, `.row` 앞 | 198 / 310 → 232 | |
| 뱀 정원 | `#ovOver` | `#overInfo` 다음, `.row` 앞 | 보드 안 오버레이(≥358px) → 여유 충분 | 오버레이에 z-index 없음 — 모달은 body 직속이라 무관 |
| 블록 스택 | `#overlay`(시작·일시정지·게임오버 공용) | `#ovText` 다음, `#startBtn` 앞. **`gameOver()`일 때만 보이고**, 시작·일시정지에서는 숨김 | 보드 600px → 여유 충분 | 오버레이 폭 최소 242px → 짧은 문구(`12위 · 87명 ›`) 자동 적용 |
| 박자 앵무새 | `#ovResult` | `#resList` 다음, `.resbtns` 앞 | 270 / 326(아래 안전영역 시 313) → 304 | 버튼 4개 모두 보일 때 기준. 여유 9px라 콤팩트 28px **필수**, 칩 위아래 margin 0 |

- 6개 게임 모두 340px대 높이에서 오버레이 세로 스크롤이 생기지 않아야 한다(QA는 740x342와 667x375에서 `scrollHeight === clientHeight` 확인).
- 칩 주입 시 게임 오버레이의 `> *` 등장 애니메이션(ovUp)이 칩에도 걸리는 건 허용(같은 리듬).
