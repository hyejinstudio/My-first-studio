# 짝꿍 카드 아트·UI 명세

> slug: `pair-flip` · 배포: 실험실 `lab/games/pair-flip/index.html` (HTML 1개 + `fonts/` 폴더)
> **규칙·수치(판 6×4, 미리보기 6.0초, 뒤집기 0.15초, 전체 뒤집힘 0.3초, 사라짐 0.35초, 틀림 보기 0.8초, 입력 예약, 기록 단위)는 design.md가 정하고**, 이 문서는 그것을 어떻게 보여 줄지만 정한다. 시간 값이 다르면 design.md가 우선.
> 그래픽: 카드 그림 12종 = **인라인 SVG `<symbol>`** (아래 코드 그대로), 판·HUD·오버레이 = DOM + CSS. Canvas 없음, 이미지 파일 없음, **게임 화면에 이모지 그래픽 없음**.
> 미리보기 렌더: 아이콘 12종·흑백·다크·뒷면·빈자리 샘플을 Chromium으로 렌더해 확인함(작업용 PNG, 저장소에 넣지 않음).

---

## 스타일 콘셉트
- **"조용한 카드 테이블"**: 따뜻한 종이색 배경(`--bg`) 위에 크림색 카드 24장이 6×4로 고르게 놓여 있다. 뒷면은 차분한 청회색(슬레이트) 한 가지. 그라데이션·광택·번쩍임·화면 흔들림 없음. 깊이는 카드의 얕은 그림자 1단으로만.
- **그림은 기하 도형 6가족 × 닮은 그림 2개**: 동그라미/고리, 위 세모/아래 세모, 네모/마름모, 초승달/반달, 잎 하나/잎 둘, 물결 하나/물결 둘. 굵은 진한 외곽선 + 단색 면(플랫). 얼굴·캐릭터 없음 → 귀엽지만 유치하지 않게, 기억 게임 본연의 "모양 기억"에 집중.
- **보고 배우기**: 시작 화면 설명은 그림 2칸(맞음 / 닮았지만 다름). 결과 화면 숫자도 아이콘과 함께.
- **공정성 (가장 중요한 시각 규칙)**: 뒷면 24장은 픽셀 단위로 동일. 뒷면 상태에서 hover·포커스·그림자·애니메이션 지연 등 어떤 것도 카드마다 다르지 않다(DOM에도 kind 없음 — design.md). 앞면이 보이는 순간에는 닮은 그림 a·b가 **한눈에** 구분된다.
- 스튜디오 공통: 상단 바·버튼·오버레이는 `games/hungry-bear/index.html`의 `.top`, `.home`, `.title`, `.spacer`, `.btns`, `button`, `button.icon`, `button.primary`, `button.secondary`/`a.secondary`, `.kbd`, `.overlay`, `body.ov-full`, `.ov-home`, `#lbSlot` CSS를 **그대로 복사**한다. 패널 radius 12~16px, 주 버튼은 `--accent` 주황.
- 글꼴: 글자는 `system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`. **숫자(시계, 남은 짝, 틀림, 결과 시간·통계, 최고 기록)는 PairDigits**.

### 숫자 글꼴 PairDigits (Pretendard ExtraBold 800 서브셋, SIL OFL 1.1)
- 불곰·악덕 사장과 **같은 방식**. 원본 Pretendard ExtraBold(800).
- 파일: `lab/games/pair-flip/fonts/pair-digits-800.woff2` + 같은 폴더 `OFL.txt`(`games/hungry-bear/fonts/OFL.txt`를 그대로 복사).
- 글리프: `%`(U+0025, 정확도), `+ , - . /`(U+002B–002F), `0-9`(U+0030–0039). **`tnum` 유지** — 시계가 0.1초마다 바뀌어도 폭이 흔들리지 않게.
  - 예: `pyftsubset Pretendard-ExtraBold.otf --unicodes="U+0025,U+002B-002F,U+0030-0039" --flavor=woff2 --layout-features='tnum' --output-file=pair-digits-800.woff2` 후 fontTools로 name 테이블 변경.
- **Reserved Font Name 때문에 이름 변경 필수**: "Pretendard"가 들어간 모든 name 레코드(ID 1, 3, 4, 6, 16, 17 등)를 `PairDigits`로 바꾸고, 압축 푼 바이트에 "Pretendard" 문자열이 없어야 한다(QA fontTools 검사). 다른 게임 서브셋(BearDigits 등) **재사용 금지**(글리프 구성이 다름). 원본을 못 구하면 CEO에게 보고.
```css
/* 숫자 전용 글꼴: Pretendard ExtraBold(SIL OFL 1.1)의 숫자·기호 서브셋. 수정본이라 내부 이름은 PairDigits. 라이선스 fonts/OFL.txt */
@font-face { font-family: "PairDigits"; src: url("fonts/pair-digits-800.woff2") format("woff2");
  font-weight: 800; font-style: normal; font-display: swap; unicode-range: U+0025, U+002B-002F, U+0030-0039; }
:root { --num-font: "PairDigits", system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif; }
.num { font-family: var(--num-font); font-weight: 800; font-variant-numeric: tabular-nums; }
```

### 표기 규칙
- 플레이 중 시계: `38.4` (0.1초, 내림 — design.md). 단위 "초"는 붙이지 않고 시계 아이콘으로 대신.
- 결과 시간: `38.47` + "초"(시스템 글꼴 700, 숫자보다 작게). 10분 이상은 "10분 넘음"(시스템 글꼴).
- 횟수: `17번`, `틀림 5번`, `정확도 71%`. 숫자만 `.num`.

---

## 색상 토큰 (라이트/다크, hex)
다크 3단 구조는 기존 게임과 같다: `:root{라이트}` / `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {다크} }` / `:root[data-theme="dark"] {다크}`. `<meta name="theme-color" content="#e4572e">`.

### 공통 (기존 게임과 이름·값 동일)
| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--bg` | #f4f1ea | #12141a | 페이지 배경(테이블) |
| `--panel` | #ffffff | #1b1e27 | 패널·버튼·알약 |
| `--ink` | #1f2430 | #eceef3 | 글자 |
| `--muted` | #6b7280 | #9aa1ae | 보조 글자 |
| `--grid` | #e7e2d8 | #262a35 | 테두리·구분선·빈 막대 |
| `--well` | #fbfaf7 | #161921 | 오버레이 바탕 |
| `--accent` | #e4572e | #ff7a50 | 주 버튼, 포커스 링, 미리보기 막대 |
| `--gold` | #f2b134 | #ffc94d | 새 기록 |
| `--good` | #5f9b6c | #85c493 | 맞음 링(비텍스트) |
| `--good-ink` | #3f7a4f | #8fd09d | "새 기록" 등 좋은 글자 |
| `--danger` | #d64545 | #ff6b6b | 틀림 점선 링(비텍스트) |
| `--loss-ink` | #b2452f | #f39a84 | 틀림 숫자 글자 |

### 카드
| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--face` | #fffdf8 | #e4dfd3 | 앞면 바탕. **다크에서도 밝은 종이색**(그림 색·외곽선을 모드와 무관하게 하나로 유지, 대비 확보). 다크 값은 눈부심을 줄인 회색빛 크림 |
| `--face-edge` | #e7e2d8 | #b9b2a3 | 앞면 1px 테두리 |
| `--back` | #5f7891 | #3b4e61 | 뒷면 바탕(슬레이트) |
| `--back-line` | rgba(244,239,228,.45) | rgba(244,239,228,.35) | 뒷면 안쪽 테두리 선 |
| `--back-dot` | rgba(255,255,255,.14) | rgba(255,255,255,.10) | 뒷면 점 무늬 |
| `--back-mark` | #f4efe4 | #f4efe4 | 뒷면 가운데 문양(SVG 안 고정 hex) |
| `--slot` | #d9d3c6 | #3a4050 | 빈자리 점선 흔적 |
| `--card-shadow` | 0 1px 2px rgba(40,50,70,.12), 0 2px 6px rgba(40,50,70,.06) | 0 1px 2px rgba(0,0,0,.4) | 카드 그림자(앞·뒷면 동일) |

### 그림 6가족 (SVG 안 고정 hex — 두 모드 공통, 앞면이 항상 밝으므로)
| 가족 | 면 색 | 외곽선(진한색) | 이름 |
|---|---|---|---|
| 1 동그라미 | #d9644f | #a8432f | 코랄 |
| 2 세모 | #e0a630 | #a87414 | 머스터드 |
| 3 네모 | #3f9a8f | #276b62 | 청록 |
| 4 달 | #8a6fc4 | #5e4a93 | 보라 |
| 5 잎 | #78a852 | #4f7a32 | 초록 |
| 6 물결 | #4f8fd0 | #2f639c | 파랑 |
- 외곽선(진한색)은 `--face`(#fffdf8 / #e4dfd3) 대비 모두 3:1 이상(비텍스트 기준). 면 색만으로는 머스터드가 약하지만 외곽선이 형태를 잡는다.
- 가족끼리 **색과 모양이 모두 다르다**. 흑백 렌더에서 12종 모두 모양만으로 구분됨을 확인했다(QA 19번 항목의 근거).

---

## 카드 그림 12종 (`<symbol>`, viewBox 0 0 48 48)
- kind 번호 = design.md 순서. `<svg class="ic"><use href="#k3"/></svg>`로 쓴다. **심볼 id는 kind 번호지만, 뒷면 상태 카드에는 `<use>` 자체를 넣지 않는다**(앞면이 될 때 `href`를 넣고, 덮일 때 뒤집기 애니메이션이 끝난 뒤 제거 — kind가 DOM에 남지 않게).
- 그림 크기 = 카드 한 변의 **60%** (`.ic { width:60%; height:60% }`). 그림 상자는 viewBox 48 중 약 36 단위 → 실제 그림 ≈ 카드의 45~58%이고, 가장 큰 마름모·물결이 약 81% × 60% = 카드의 49% 폭. design.md "그림 55~65%"는 **SVG 상자 기준 60%**로 맞춘다(QA는 `.ic` 크기 / 카드 크기로 측정).
- 선 두께 기준(그림 상자 36 단위의 12% = 4.3 단위 이상): 고리 띠 폭 7.5, 물결 선 10(외곽 포함)/5.5(색), 초승달 가장 굵은 곳 9.7, 잎 둘 각 잎 폭 13. 모두 충족.
- 같은 가족 a·b의 차이: 동그라미 **채움 vs 구멍**(구멍 지름 = 원의 53%), 세모 **방향 180°**, 네모 **45° 회전**(마름모가 대각 길이로 더 커 보임 → 외곽 모양 확실히 다름), 달 **가는 곡선 vs 직선 면이 있는 두꺼운 반원**, 잎 **1장 vs 2장(V자)**, 물결 **1줄 vs 2줄**.

```html
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
<defs>
<!-- 가족 1 동그라미 (코랄) -->
<symbol id="k0" viewBox="0 0 48 48"><circle cx="24" cy="24" r="16" fill="#d9644f" stroke="#a8432f" stroke-width="2.5"/></symbol>
<symbol id="k1" viewBox="0 0 48 48"><path d="M24 8 A16 16 0 1 1 24 40 A16 16 0 1 1 24 8 Z M24 15.5 A8.5 8.5 0 1 0 24 32.5 A8.5 8.5 0 1 0 24 15.5 Z" fill="#d9644f" fill-rule="evenodd" stroke="#a8432f" stroke-width="2.5"/></symbol>
<!-- 가족 2 세모 (머스터드) -->
<symbol id="k2" viewBox="0 0 48 48"><path d="M24 6 L42 37 H6 Z" fill="#e0a630" stroke="#a87414" stroke-width="2.5" stroke-linejoin="round"/></symbol>
<symbol id="k3" viewBox="0 0 48 48"><path d="M6 11 H42 L24 42 Z" fill="#e0a630" stroke="#a87414" stroke-width="2.5" stroke-linejoin="round"/></symbol>
<!-- 가족 3 네모 (청록) -->
<symbol id="k4" viewBox="0 0 48 48"><rect x="9" y="9" width="30" height="30" rx="3" fill="#3f9a8f" stroke="#276b62" stroke-width="2.5"/></symbol>
<symbol id="k5" viewBox="0 0 48 48"><path d="M24 4.5 L43.5 24 L24 43.5 L4.5 24 Z" fill="#3f9a8f" stroke="#276b62" stroke-width="2.5" stroke-linejoin="round"/></symbol>
<!-- 가족 4 달 (보라) -->
<symbol id="k6" viewBox="0 0 48 48"><path d="M13 5 A19 19 0 0 1 13 43 A24 24 0 0 0 13 5 Z" fill="#8a6fc4" stroke="#5e4a93" stroke-width="2.5" stroke-linejoin="round"/></symbol>
<symbol id="k7" viewBox="0 0 48 48"><path d="M14 5 A19 19 0 0 1 14 43 Z" fill="#8a6fc4" stroke="#5e4a93" stroke-width="2.5" stroke-linejoin="round"/></symbol>
<!-- 가족 5 잎 (초록) -->
<symbol id="k8" viewBox="0 0 48 48"><g transform="translate(24 42)" stroke="#4f7a32" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">
  <path d="M0 0 V4" fill="none" stroke-width="3"/>
  <path d="M0 0 Q-21 -18 0 -36 Q21 -18 0 0 Z" fill="#78a852"/>
  <path d="M0 -5 V-28" fill="none" stroke-width="2.2"/>
</g></symbol>
<symbol id="k9" viewBox="0 0 48 48"><g transform="translate(24 40)" stroke="#4f7a32" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">
  <path d="M0 0 V4" fill="none" stroke-width="3"/>
  <g transform="rotate(-32)"><path d="M0 0 Q-13 -14.5 0 -29 Q13 -14.5 0 0 Z" fill="#78a852"/><path d="M0 -5 V-22" fill="none" stroke-width="2.2"/></g>
  <g transform="rotate(32)"><path d="M0 0 Q-13 -14.5 0 -29 Q13 -14.5 0 0 Z" fill="#78a852"/><path d="M0 -5 V-22" fill="none" stroke-width="2.2"/></g>
</g></symbol>
<!-- 가족 6 물결 (파랑): 진한 밑선 10 + 색 윗선 5.5 -->
<symbol id="k10" viewBox="0 0 48 48"><g fill="none" stroke-linecap="round" stroke-linejoin="round">
  <path d="M7 24 q4.25 -8 8.5 0 t8.5 0 t8.5 0 t8.5 0" stroke="#2f639c" stroke-width="10"/>
  <path d="M7 24 q4.25 -8 8.5 0 t8.5 0 t8.5 0 t8.5 0" stroke="#4f8fd0" stroke-width="5.5"/>
</g></symbol>
<symbol id="k11" viewBox="0 0 48 48"><g fill="none" stroke-linecap="round" stroke-linejoin="round">
  <path d="M7 16 q4.25 -8 8.5 0 t8.5 0 t8.5 0 t8.5 0 M7 33 q4.25 -8 8.5 0 t8.5 0 t8.5 0 t8.5 0" stroke="#2f639c" stroke-width="10"/>
  <path d="M7 16 q4.25 -8 8.5 0 t8.5 0 t8.5 0 t8.5 0 M7 33 q4.25 -8 8.5 0 t8.5 0 t8.5 0 t8.5 0" stroke="#4f8fd0" stroke-width="5.5"/>
</g></symbol>
<!-- 뒷면 문양 (viewBox 0 0 40 40): 4갈래 별꽃 + 옅은 원. 앞면 12종과 겹치지 않는 모양 -->
<symbol id="back-mark" viewBox="0 0 40 40"><g fill="none" stroke="#f4efe4" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
  <circle cx="20" cy="20" r="15" stroke-opacity=".55"/>
  <path d="M20 8 Q23 17 32 20 Q23 23 20 32 Q17 23 8 20 Q17 17 20 8 Z" fill="#f4efe4" fill-opacity=".22"/>
</g></symbol>
</defs>
</svg>
```
- `stroke-width`는 viewBox 단위라 카드 크기에 비례한다(`vector-effect` 쓰지 않음). 110px 카드에서 외곽선 약 3.4px, 물결 색선 약 7.6px.
- 그림 이름(접근성·해설용): 동그라미 / 고리 / 위 세모 / 아래 세모 / 네모 / 마름모 / 초승달 / 반달 / 잎 하나 / 잎 둘 / 물결 하나 / 물결 둘 (kind 0~11).

---

## 카드 구조·앞면·뒷면

### DOM (24칸 고정)
```html
<div class="board" role="grid" aria-label="카드 판">           <!-- 6열 × 4행, CSS grid -->
  <div class="cell" role="gridcell">                          <!-- 자리. 짝이 사라져도 남아 흔적을 그림 -->
    <button class="card" aria-label="카드 1행 1열, 뒷면">
      <span class="flip">                                     <!-- 회전하는 층 (preserve-3d) -->
        <span class="face back"><svg class="mark"><use href="#back-mark"/></svg></span>
        <span class="face front"><svg class="ic"></svg></span>  <!-- 앞면일 때만 <use href="#kN"> 삽입 -->
      </span>
    </button>
  </div> … ×24
</div>
```
- `.cell { perspective: 700px; }`, `.flip { position:relative; width:100%; height:100%; transform-style: preserve-3d; transition: transform var(--t-flip) cubic-bezier(.3,.7,.4,1); }`
- 뒷면 상태 = `.flip { transform: rotateY(180deg) }`, 앞면 상태 = `rotateY(0)`. `.face { position:absolute; inset:0; backface-visibility:hidden; -webkit-backface-visibility:hidden; border-radius: var(--r); }`, `.back { transform: rotateY(180deg) }`.
- **Safari 주의**: `.flip`·`.face`에 `overflow:hidden` 금지(preserve-3d 깨짐/깜빡임). radius는 각 `.face`에 직접. `.card`에 `will-change: transform`은 미리보기 시작 시 넣고 결과 화면에서 뺀다(24장 상시 레이어는 메모리 낭비).
- `.board`, `.cell`, `.card` 어디에도 `filter` 금지. `.app`과 오버레이의 조상에는 transform/filter/perspective 금지(ov-full position:fixed 보호, 공통 교훈) — perspective는 `.cell`에만.

### 카드 모양
- **정사각형**(design.md: 카드 크기 = min(폭/6, 높이/4) − 간격). radius `--r = round(카드 × 0.1)`px (110px → 11px, 156px → 16px).
- 앞면: `--face` + 1px `--face-edge` + `--card-shadow`, 가운데 `.ic` 60%.
- 뒷면: `background: radial-gradient(circle, var(--back-dot) 1.2px, transparent 1.7px) 0 0 / 9px 9px, var(--back);` + 안쪽 테두리 `box-shadow: inset 0 0 0 calc(var(--c)*.035) var(--back), inset 0 0 0 calc(var(--c)*.035 + 1.5px) var(--back-line), var(--card-shadow)` (`--c` = 카드 px) + 가운데 `.mark` 46%. 점 무늬 시작점은 카드 기준(`background-position` 0 0)이라 24장 동일.
- **빈자리 흔적**(짝이 사라진 자리): `.cell.gone::before { content:""; position:absolute; inset:0; border:1.5px dashed var(--slot); border-radius: var(--r); }` 카드 버튼은 `visibility:hidden` + `disabled`. 채움 없음. 아주 옅게 — 판의 리듬(자리)만 남고 눈에 띄지 않는다.

---

## 레이아웃 (PC / iPad 세로 / iPad 가로)

### 화면 구성
```
일반 (H > 520): 위→아래 1열
┌ .top 상단 바 (TB 52) ─ ← 게임 목록 · 제목 · (flex) · [시계 알약] · 음소거 · 일시정지 ┐
├ .cue 안내 띠 (CB 36) ─ 미리보기: 눈 + "외우세요" + 6초 막대 / 플레이: 남은 짝 · 틀림 · (오른쪽) 최고 ┤
└ .stage 판 영역 ─ .board 6×4 (가로·세로 가운데 정렬) ┘

낮은 화면 (H ≤ 520, 폰 가로): .rail 왼쪽 세로 막대(폭 96) + 판
┌ rail ┬──────── board ────────┐
│ ←    │                        │
│ 시계 │      6 × 4             │
│ 짝 9 │                        │
│ 틀림3│                        │
│ M  Ⅱ │                        │
└──────┴────────────────────────┘
```
- 판은 **모든 방향에서 6열 × 4행**(회전 없음 — design.md). 세로 화면에서는 카드가 작아지고 판 위아래로 여백이 남는다 → 판을 판 영역의 **세로 가운데**에 둔다(아래로 몰지 않음).

### 크기 계산 (불곰과 같은 높이 기준 방식)
1. `--app-h = window.innerHeight + 'px'`를 `resize`·`orientationchange`·`visualViewport.resize`에서 갱신. CSS 기본값 `100dvh`(미지원 `100vh`). `html, body { height: var(--app-h); overflow: hidden; }`. body 패딩 `max(12px, env(safe-area-inset-*))`(H ≤ 520이면 네 변 모두 `max(6px, …)` — 노치 쪽은 안전 영역이 우선이라 폭이 줄지만 카드는 높이 기준이라 88 유지). viewport meta `width=device-width, initial-scale=1, viewport-fit=cover`.
2. `W`, `H` = 패딩 뺀 크기. 일반: `TB = 52`, `CB = 36`, 간격 8. 판 영역 `AW = min(W, 1100)`, `AH = H − 52 − 8 − 36 − 8`.
   낮은 화면(H ≤ 520): rail 폭 96 + 간격 8 → `AW = W − 104`, `AH = H`.
3. 카드 간격 `g = 10`(W < 420 또는 H ≤ 520이면 8 — design.md 최소 8pt).
4. **카드 한 변 `c = floor(min((AW − 5g) / 6, (AH − 3g) / 4, 156))`**. 판 크기 `6c + 5g` × `4c + 3g`. 크기는 JS가 계산해 `--c`로 넣고 `grid-template-columns: repeat(6, var(--c))`.
5. 회전·크기 변경 → 4단계만 다시(카드 상태·시계 그대로). 트랜지션 없이 즉시.

| 화면 (CSS px) | 패딩 뺀 W × H | 판 영역 | g | **카드 c** | 판 크기 |
|---|---|---|---|---|---|
| PC 1280×800 | 1256 × 776 | 1100 × 672 | 10 | **156** (상한) | 986 × 654 |
| iPad 가로 1080×810 | 1056 × 786 | 1056 × 682 | 10 | **156** | 986 × 654 |
| iPad 가로 1080×740 (Safari 바) | 1056 × 716 | 1056 × 612 | 10 | **145** | 920 × 610 |
| iPad mini 가로 1133×744 | 1109 × 720 | 1100 × 616 | 10 | **146** | 926 × 614 |
| iPad 세로 810×1080 | 786 × 1056 | 786 × 952 | 10 | **122** | 782 × 518 |
| iPad 세로 768×1024 | 744 × 1000 | 744 × 896 | 10 | **115** | 740 × 490 |
| iPad mini 세로 744×1133 | 720 × 1109 | 720 × 1005 | 10 | **111** | 716 × 474 |
| 폰 가로 844×390 (rail) | 832 × 378 | 728 × 378 | 8 | **88** | 568 × 376 |
| 폰 세로 390×664 | 366 × 640 | 366 × 536 | 8 | 54 (미달) | 364 × 240 |
- **iPad·PC 전부 카드 ≥ 111px**(design.md 88pt 충족). 폰 가로는 rail 배치로 88px.
- **폰 세로는 88 미달(54px)** — 6열 고정이라 불가피. 대응: 폰 세로(W < 560 그리고 H > W)일 때만 cue 띠 오른쪽에 "가로로 돌리면 카드가 커져요" 작은 알약(회전 아이콘 + 13px `--muted`, 미리보기 전 시작 화면에도 1줄). 게임은 그대로 할 수 있다. iPad 대상이 아니므로 차단하지 않음 — CEO 판단 사항으로 보고.
- **검증 기준**(QA): 위 9개 화면 + 다크에서 `scrollWidth ≤ innerWidth`, `scrollHeight ≤ innerHeight`, 24장 전부 화면 안, 카드 크기가 표 값 ±1px, 카드끼리 겹침 없음.

### 상단 바 (hungry-bear `.top` 복사)
순서: `← 게임 목록` · 제목 "짝꿍 카드"(18px 800) · (flex 1) · **시계 알약** · 음소거 · 일시정지.
- **시계 알약** `.clock`: 높이 44, radius 999, `--panel` + 1px `--grid`, 패딩 0 14px, 최소 폭 104. 스톱워치 아이콘(18px, stroke `--muted` 2) + `.num` 22px 시간(`38.4`). `role="timer"`, `aria-label`은 10초마다만 갱신("38초")해 낭독 폭주 방지.
  - 미리보기·뒤집힘 중: `0.0` 을 `--muted`로. 시계가 도는 순간 `--ink`.
  - 일시정지 중: 숫자 옆 작은 Ⅱ 표시(10px, `--muted`).
  - 600초 이상: `10:00+` 대신 그냥 계속 `612.3`(폭은 늘어남 — 최소 폭 안에서 왼쪽 정렬 고정).
- 상단 바 폭 < 640: 제목 숨김 / < 420: "← 목록".
- 음소거·일시정지 44 × 44, 아이콘·`aria-pressed`는 hungry-bear와 같다.

### 안내 띠 `.cue` (높이 36, 가운데 정렬, 15px 700)
| 단계 | 내용 |
|---|---|
| 미리보기 | 눈 아이콘(18px) + "외우세요" + **카운트다운 막대**(폭 min(320, 띠 폭 × 0.45), 높이 8, radius 4, 트랙 `--grid`, 채움 `--accent` 100% → 0%, 6.0초 linear) + 오른쪽 `.num` 15px 남은 초 `5`·`4`…(올림 정수, `--muted`). 막대가 정보의 주인공 |
| 뒤집힘(0.3초) | 막대가 0이 된 상태 그대로 |
| 플레이 | 왼쪽 "남은 짝" 13px `--muted` + `.num` 18px `9` · 구분점 · "틀림" 13px `--muted` + `.num` 18px `3`(`--loss-ink`, 0이면 `--ink`) · (flex) · 오른쪽 "최고" 13px `--muted` + `.num` 15px `32.18`(기록 없으면 숨김) |
- 단계가 바뀔 때 글자 α 크로스페이드 160ms. 숫자 변화는 아래 이펙트.
- **rail 배치**(H ≤ 520): rail 위→아래 `← 목록`(44) · 시계(세로 알약 96 × 56: 아이콘 위, `.num` 22px 아래) · 미리보기 막대(가로 80 × 6) 또는 "남은 짝 9"/"틀림 3" 두 줄(13px + `.num` 16px) · 맨 아래 음소거·일시정지 가로 2개(44). 최고 기록은 rail에서 생략.

---

## HUD·메뉴·오버레이

### 1. 시작 화면 (`#ovStart`, `body.ov-full`)
- 뒤 판에는 뒷면 카드 24장이 놓여 있다(오버레이 `--well` 97%라 거의 가려짐 — 공통 방식).
- 카드(최대 폭 520): 제목 "짝꿍 카드" 26px 800 → 부제 "처음에 외우고, 같은 그림 두 장을 찾아 다 없애요." 15px `--muted` keep-all.
- **그림 예시 2칸**(가로 2칸, 칸 사이 12px, 각 칸 `--panel` + 1px `--grid` radius 12, 패딩 12). 카드 그림은 실제 심볼을 작은 카드(44px, 폭 < 420이면 36px)로:
  1. **맞음**: [고리] [고리] → 화살표 → [빈자리 점선] [빈자리 점선] + 오른쪽 위 작은 체크 원(20px `--good`, 흰 체크). 캡션 "똑같으면 사라져요".
  2. **닮았지만 다름**: [동그라미] [고리] → 화살표 → [뒷면] [뒷면] + 작은 X 원(20px `--danger`). 캡션 "닮기만 하면 다시 덮여요".
  - 캡션 13px 700 한 줄(keep-all). 칸 안 화살표 14px `--muted` stroke 아이콘.
- 최고 기록 줄: "최고" 13px `--muted` + `.num` 20px `32.18` + "초", 없으면 "기록 없음" 13px `--muted`.
- `시작` 주 버튼(높이 52, 최소 폭 200) + PC만 "Enter" `.kbd`. `.ov-home` 공통. 음소거는 상단 바 그대로 보임(ov-full이어도 상단 바 버튼과 같은 상태 — 불곰 방식).
- 폰 세로면 버튼 위에 회전 안내 1줄(위 레이아웃 참고).

### 2. 미리보기 (오버레이 없음)
- 시작 → 24장이 **앞면으로** 나타난다(아래 "등장"). 안내 띠에 눈 + "외우세요" + 6초 막대. 카드는 `disabled` 아님(포커스는 되지만 탭은 무시 — design.md), 커서 기본.
- 막대가 끝나면 24장 **동시에** 뒷면으로(0.3초). 끝나는 순간 시계 `--ink`로 바뀌며 시작.

### 3. 플레이 (오버레이 없음)
- 첫 번째로 연 카드: 앞면 + 살짝 들림(그림자 한 단 진하게 `0 4px 10px rgba(40,50,70,.18)`, 다크 `rgba(0,0,0,.5)`). 위치 이동 없음.
- 맞음 / 틀림 연출은 아래 이펙트 표.
- 대기(틀림 0.8초) 중 예약된 카드: 예약 순간 **표시 없음**(예약은 0.8초 안에 자동 처리되므로 시각 피드백 불필요, 누른 감각은 `:active` scale만). 덮이기 시작할 때 바로 열림.

### 4. 일시정지 (`#ovPause`, `body.ov-full`) — 판 전체 덮개
- 공통 구조: 제목 "잠깐 쉬어요" 22px 800, `계속하기`(주, Enter·P·Esc) / `처음부터`(secondary) / `게임 목록`(.ov-home).
- **이중 가림**: (1) ov-full 오버레이 `--well` **불투명 100%**(공통 97% 대신 이 게임만 `#ovPause { background: var(--well) }` — 3% 비침도 막음). (2) `.board.covered .face { visibility:hidden }` — 오버레이가 늦게 그려지는 한 프레임에도 카드가 안 보이게, 덮개를 먼저 켜고 오버레이를 연다.
- 일시정지 순간 열려 있던 카드는 design.md대로 즉시 덮음 — 애니메이션 없이 뒷면 상태로 바로 바꾼다(가려져 있으므로).
- 계속하기 → 오버레이 닫힘(ovOut 200ms) → `.covered` 해제 → 0.3초 입력 잠금 동안 판 `opacity .85→1` 300ms(잠김을 은근히 표시). 시계는 잠금이 풀린 순간 다시 흐른다.
- 미리보기 중 일시정지: 막대도 멈춘 상태로 덮임, 계속 후 이어서.

### 5. 결과 (`#ovResult`, `body.ov-full`) — design.md "결과 화면" 문구 그대로
```
┌──────────────────────────────┐
│  다 찾았어요!                 │  24px 800  (새 기록이면 아래 금색 알약)
│  38.47초      [#lbSlot]       │  .num 56px + "초" 20px 700, 같은 줄 lbSlot(flex-wrap)
│  ( 새 기록! )                 │  --gold 테두리 2px 알약, 글자 --ink 14px 800
│ ┌──────┬──────┬──────┐       │  통계 3칸
│ │ 시도 │ 틀림 │정확도│       │
│ │ 17번 │ 5번  │ 71%  │       │
│ └──────┴──────┴──────┘       │
│  12쌍을 17번 만에 찾았어요     │  13px --muted (스크린 리더용 요약 겸)
│  [모래시계] 틀릴 때마다 0.8초를 기다렸어요 (모두 4.0초). 이 시간은 이미 위 시간에 들어 있어요.
│  최고 기록 32.18초            │  또는 "이전 기록 40.02초 → 38.47초"
│  [ 다시 하기 ]  [ 게임 목록 ]  │
└──────────────────────────────┘
```
- **통계 3칸**: 각 칸 `--panel` + 1px `--grid` radius 12, 높이 72(H ≤ 520이면 56). 위 라벨 12px 700 `--muted` + 작은 아이콘(14px: 시도 = 카드 두 장, 틀림 = X, 정확도 = 과녁 원 2겹), 아래 `.num` 24px 숫자 + 단위 13px. 틀림 숫자는 `--loss-ink`(0이면 `--good-ink` "0번").
- **기다린 시간 줄**(틀림 ≥ 1일 때만): 모래시계 아이콘 14px + 13px `--ink`. "이미 들어 있어요"를 반드시 포함 — 더해진 벌점이 아니라는 설명. 둘째 문장은 `--muted`.
- **이전 기록 대비**: 새 기록이면 "이전 기록 `40.02`초 → `38.47`초" (화살표 `--good-ink`, 차이 `−1.55초`를 괄호로 `--good-ink` 13px). 아니면 "최고 기록 `32.18`초 (`+6.29`초)" — 차이는 `--muted`(빨간색 쓰지 않음, 차분하게). 첫 기록이면 "첫 기록이에요".
- 10분 이상: 큰 숫자 자리에 "10분 넘음" 32px 800 + 그 아래 "10분이 넘으면 최고 기록에 남지 않아요." 13px `--muted`.
- 테스트 판: 제목 옆 작은 알약 "테스트 판"(11px, `--muted`, 1px `--grid`).
- 버튼: `다시 하기`(주, 52, Enter — 바로 미리보기) / `게임 목록`(secondary, `.ov-home`). 결과 뜬 뒤 0.7초 입력 잠금 동안 버튼 `opacity .6`(잠금 표시) → 1.
- `#lbSlot`은 큰 시간 숫자와 같은 줄(실험실에서는 비어 있음, 출시 때 순위 칩).
- 높이: 카드 최대 폭 520, 내용이 H를 넘으면 오버레이 안 스크롤 대신 간격 축소(H ≤ 520: 큰 숫자 44px, 통계 56, 줄 간격 4). QA: 폰 가로 844×390에서 결과 전체가 스크롤 없이 보여야 함.

---

## 애니메이션·이펙트 (지속시간 ms, easing)
시간 값은 design.md 기준. CSS 변수로 둔다: `--t-flip: 150ms; --t-flipall: 300ms; --t-gone: 350ms;` (틀림 보기 800ms는 JS 타이머).

| 이펙트 | 내용 | ms | easing |
|---|---|---|---|
| 등장 (시작 직후) | 24장 앞면으로 α 0→1 + scale .94→1. **행 단위 지연 0/40/80/120ms**(같은 행은 동시 — 카드마다 다른 지연은 뒷면 단서가 아니지만 단순하게) | 200 | ease-out |
| 미리보기 막대 | 너비 100%→0% (`transform: scaleX`, origin left) | 6000 | linear |
| 전체 뒤집힘 | 24장 **동시에** rotateY 0→180°. 끝(`transitionend` 대신 JS 타이머 300ms)에 시계 시작 | 300 | cubic-bezier(.4,0,.2,1) |
| 카드 한 장 뒤집기 | rotateY 180→0 (열기) / 0→180 (덮기). 회전 중간(90°)에 그림이 바뀌는 게 아니라 앞·뒷면 2장 구조라 자연히 보임 | 150 | cubic-bezier(.3,.7,.4,1) |
| 누름 피드백 | `.card:active .flip` 대신 `.card:active { transform: scale(.96) }` (회전층과 분리) | 80 | ease-out |
| **맞음** | 두 번째 카드가 앞면이 된 순간(탭 +150ms)부터: 두 장 테두리 `--good` 3px 링(outline, offset 2px) 즉시 + scale 1→1.06 (0~100ms) → scale 1.06→.72, α 1→0 (100~350ms). 끝나면 자리 `.gone`(점선 흔적 α 0→1 160ms) | 350 | 앞 ease-out / 뒤 ease-in |
| 남은 짝 숫자 | 즉시 교체 + scale 1→1.15→1 | 160 | ease-out |
| **틀림** | 두 번째 카드가 앞면이 된 순간부터 800ms 보기: 두 장에 `--danger` **점선** 3px 링(outline-style dashed, offset 2px) + 두 장 translateX 0→−5→5→−3→0 (첫 240ms만, `.card`에 — `.flip`과 별개). 800ms 뒤 링 제거 + 두 장 동시에 덮기(150ms) | 240 흔들림 / 800 보기 | ease-in-out |
| 틀림 숫자 | 즉시 교체 + 색 `--loss-ink` + scale 1→1.15→1 | 160 | ease-out |
| 마지막 짝 | 맞음 연출 + 시계 알약 테두리 `--good` 600ms + 판 위 빈자리 점선 전체가 α .4→1→.4 한 번(물결 아님, 동시) | 600 | ease-out |
| 결과 오버레이 | 마지막 사라짐 후 400ms(design.md) → 공통 ovIn/ovUp. 큰 숫자 0에서 세어 올리기 없음(정확한 숫자 바로) | 200 | ease-out |
| 새 기록 알약 | scale .8→1 + α, 결과 등장 +200ms | 220 | cubic-bezier(.3,1.4,.5,1) |
| 일시정지 덮개 해제 후 | 판 opacity .85→1 (입력 잠금 0.3초 표시) | 300 | linear |
| 오버레이 | 공통 ovIn/ovUp | 200 | ease-out |
- 움직임은 `transform`/`opacity`/`outline-color`만. 화면 흔들림·번쩍임 없음.
- 일시정지·탭 숨김 시 진행 중 CSS 트랜지션은 그대로 끝나도 된다(덮개가 가림). 단 **틀림 800ms 타이머와 미리보기 막대는 JS 시간으로 관리**해 정지·재개와 정확히 맞춘다(막대는 남은 비율을 매 프레임 `scaleX`로 써 넣음 — CSS animation 아님).
- 맞음 사라짐이 진행 중인 카드는 `pointer-events:none`(design.md: 사라지는 두 장 탭 무시).

### 모션 줄이기 (`prefers-reduced-motion: reduce`)
**시간 값은 바꾸지 않는다**(기록 공정성 — 연출 시간이 대기에 영향을 주지 않게 design.md 타이밍 유지).
- 뒤집기(150ms)·전체 뒤집힘(300ms): rotateY 대신 **크로스페이드** — 뒷면 α 1→0 / 앞면 α 0→1 같은 시간, `.flip` transform 없음(`.face.back`도 rotate 없이 겹쳐 둠).
- 등장: α만(scale 없음, 행 지연 없음).
- 맞음: 링 표시 + α 1→0 350ms(scale 없음).
- 틀림: 흔들림 없음. 점선 링 + 카드 오른쪽 위 작은 X 배지(18px 원 `--danger`, 흰 X) 800ms.
- 숫자 scale 팝 없음, 새 기록 알약 α만. 미리보기 막대는 그대로(정보).

---

## 조작 UI (터치 버튼 크기 ≥ 44px, 제스처, 키 매핑)
- **카드 = 버튼 전체**(iPad 최소 111px, 폰 가로 88px). 간격 8~10px은 판정 없음(오탭 방지).
- 입력은 design.md대로 **`pointerdown`**(click 아님). 첫 포인터만. `.board { touch-action: none; }`, 그 밖 `body { touch-action: manipulation; }`.
- **iPad Safari**: `body { user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; -webkit-tap-highlight-color: transparent; }`, `dblclick`·`gesturestart`에 `preventDefault`(더블탭 확대·핀치 방지), 판에서 `contextmenu` 막기. 가로 스크롤 0, 세로 스크롤 0.
- 기타 버튼(시작·다시 하기·상단 바·일시정지 메뉴)은 44 × 44 이상(주 버튼 48~52).
- hover(`hover:hover and pointer:fine`): 뒷면 카드에 테두리 `--accent` α .5 → **24장 모두 같은 규칙**이라 단서 아님. 앞면·빈자리·미리보기 중에는 hover 없음.
- **키보드** (design.md 조작 표):
| 키 | 동작 |
|---|---|
| ← → ↑ ↓ | 포커스 테두리 이동(빈자리도 지나감, 가장자리에서 멈춤). 처음 누를 때 왼쪽 위 칸에서 시작 |
| Space / Enter | 포커스한 카드 뒤집기 (시작·결과 화면에서는 시작/다시 하기) |
| P, Esc | 일시정지 열기/닫기 |
| M | 음소거 |
| 조합키(Ctrl/Meta+…) | 무시(브라우저 기본 동작) |
- **키보드 포커스 테두리**: `--accent` 3px 바깥 링(`box-shadow: 0 0 0 3px var(--accent)`, radius 카드와 같음). 빈자리에 포커스가 있으면 점선 흔적 위에 같은 링. 키를 처음 누를 때 보이고 포인터를 쓰면 숨김(`body.kbd-nav` 클래스). 포커스는 roving tabindex(판 전체가 Tab 한 번).

---

## 접근성 (대비, 색 외 구분 수단)
- **그림 구분**: 가족 간 색 + 모양 둘 다 다름, 가족 안은 모양(채움/방향/회전/개수) 차이. 흑백에서도 12종 구분(렌더 확인). 색약 시뮬레이션은 미검증 — QA가 Chromium DevTools 시각 장애 에뮬레이션(제2색맹·제1색맹)으로 스크린샷 추가 권장.
- **맞음/틀림**: 색 + 선 모양(실선 링 / 점선 링) + 결과(사라짐 / 다시 덮임) + 소리. reduced-motion의 X 배지.
- **대비**: 글자는 `--ink`, `--muted`, `--good-ink`, `--loss-ink`만(패널·`--well` 대비 4.5:1 이상). 링·막대·그림 외곽선은 비텍스트 3:1 이상. 뒷면 문양은 장식.
- **스크린 리더** (design.md 공정성 규칙 준수):
  - 뒷면: `aria-label="카드 2행 3열, 뒷면"`. 앞면: `"카드 2행 3열, 고리"`. 빈자리: `"2행 3열, 빈자리"` + `aria-disabled="true"`.
  - 안내 띠 `aria-live="polite"`: "6초 동안 외우세요" → "시작" → 맞음 시 "고리 짝을 찾았어요. 남은 짝 9" / 틀림 시 "동그라미와 고리, 다른 그림이에요".
  - 미리보기 중 카드 라벨은 앞면 이름(보이는 그대로). 시계는 10초마다만 낭독.
  - 결과: 통계 칸마다 `aria-label="시도 17번"` 등, 요약 문장 한 번 낭독.
  - 장식 SVG(뒷면 문양, 아이콘) `aria-hidden="true"`.
- 공통 포커스 링: `outline: 3px solid var(--accent); outline-offset: 2px`.
- 1초에 3번 넘는 번쩍임 없음.

---

## 실험실 목록 카드 (`lab/index.html`, `.grid` 맨 앞)
- 제목: **짝꿍 카드** / 한 줄 설명: **외우고, 같은 그림 두 장 찾기** / `aria-label="짝꿍 카드 — 외우고, 같은 그림 두 장 찾기"`, `href="games/pair-flip/"`.
- 타일 색 토큰 `--tile-pair`: 라이트 `#f2e4e7`(먼지 낀 장밋빛), 다크 `#261b20`. 기존 타일(peach·green·blue·lavender·sand 계열)과 겹치지 않는다. **lab/index.html의 라이트 `:root` 1곳 + 다크 2곳**(`@media` 안 `:root:not([data-theme="light"])`, `:root[data-theme="dark"]`) 모두에 추가. (출시 때 루트 index.html로 같은 값을 옮긴다.)
- 카드 형식은 기존 tiny-company 카드와 같다: `<a class="game">` → `<div class="art" style="--tile: var(--tile-pair)">` → `<svg viewBox="0 0 64 64" aria-hidden="true">` → `<h2>` → `<p>`.
- 아이콘 SVG(뒷면 카드 위에 고리 앞면 카드가 겹친 모습, 고정 hex — 라이트·다크 타일 모두 렌더 확인함):
```svg
<svg viewBox="0 0 64 64" aria-hidden="true">
  <g transform="rotate(-10 22 33)">
    <rect x="8" y="14" width="28" height="38" rx="5" fill="#5f7891"/>
    <rect x="11.5" y="17.5" width="21" height="31" rx="3" fill="none" stroke="#f4efe4" stroke-opacity=".5" stroke-width="1.3"/>
    <path d="M22 26 Q23.5 31.5 28 33 Q23.5 34.5 22 40 Q20.5 34.5 16 33 Q20.5 31.5 22 26 Z" fill="#f4efe4" fill-opacity=".55"/>
  </g>
  <g transform="rotate(8 42 31)">
    <rect x="28" y="12" width="28" height="38" rx="5" fill="#fffdf8" stroke="#cfc8b9" stroke-width="1.4"/>
    <path d="M42 22 A9 9 0 1 1 42 40 A9 9 0 1 1 42 22 Z M42 26.4 A4.6 4.6 0 1 0 42 35.6 A4.6 4.6 0 1 0 42 26.4 Z" fill="#d9644f" fill-rule="evenodd" stroke="#a8432f" stroke-width="1.4"/>
  </g>
</svg>
```

---

## 개발자 체크리스트 (요약)
1. 판은 항상 6×4, 카드 정사각형 `c = floor(min((AW−5g)/6, (AH−3g)/4, 156))`, 세로 가운데 정렬. 회전 시 크기만 재계산.
2. 그림 12종·뒷면 문양은 위 `<symbol>` 코드를 **그대로** 사용. 그림 크기 60%. 뒷면 카드에는 `<use>`를 넣지 않는다(덮기 애니메이션이 끝난 뒤 제거).
3. 뒤집기는 `.cell`의 perspective + `.flip` preserve-3d + `.face` backface-visibility(-webkit- 포함). `.flip`/`.face`에 overflow:hidden 금지. 누름 scale은 `.card`, 회전은 `.flip`으로 층 분리.
4. 시간: 뒤집기 150 / 전체 뒤집힘 300 / 맞음 사라짐 350 / 틀림 보기 800(JS) / 미리보기 막대 6000(JS, scaleX). reduced-motion은 시간 그대로, 회전 → 크로스페이드.
5. 시계 HUD 0.1초 `.num` 22px, 결과 0.01초 56px. PairDigits(이름 변경 + OFL.txt) — "Pretendard" 문자열 0.
6. 일시정지 = `.board.covered` 먼저 + 불투명 `--well` 오버레이. 계속 후 0.3초 잠금 동안 판 opacity .85.
7. 결과 화면 문구·숫자는 design.md "결과 화면" 그대로, 기다린 시간 줄에 "이미 시간에 들어 있어요" 포함.
8. 빈자리는 1.5px 점선 `--slot`만. 다른 카드는 절대 움직이지 않는다.
9. 실험실 카드: `--tile-pair` 3곳 + 위 아이콘 SVG, `lib/leaderboard.js` 불러오지 않음(`#lbSlot`과 `window.Leaderboard &&` 가드는 둔다).
10. 폰 세로(54px)는 88 미달 — 회전 안내 알약만 띄우고 진행 허용(CEO 확인 사항).
