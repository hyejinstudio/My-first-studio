# 박자 앵무새 (parrot-beat) — 사운드 명세

이 게임은 **소리가 핵심**이다. 모든 소리는 Web Audio API로 실시간 합성한다(음원 파일 없음, 오리지널 소리·코드 진행만 사용).
코드: `docs/games/parrot-beat/sound-module.js` → Developer가 `games/parrot-beat/index.html` 안의 독립 `<script>` 블록에 그대로 붙여 넣는다.

- 공통 API: `Sound = { unlock(), play(name, opts), setMuted(bool), isMuted(), startMusic(opts), stopMusic(fadeSec) }` (기존 게임과 같은 형태)
- 추가: `Sound.setVolume(0~1)`, `Sound.getVolume()`
- 리듬용: **`Sound.Beat`** — 박자 시계, lookahead 스케줄러, 판정용 시간 변환 (아래 4장)

> **변경 (2026-11-14, 사용자 피드백 "선생님 앵무새가 칠 때 뒤에 배경 소리는 안 나게 / 선생님이 치고 내가 너무 바로 친다")**
> 1. 부르기(`call`) 마디: 코드·베이스·하이햇·메트로놈 **전부 제거**. 선생님 북 + 정박 4개의 아주 약한 기준 틱만.
> 2. 새 phase **`ready`**(부르기 → 따라하기 사이 "준비"): 박마다 부드러운 카운트, 마지막 박은 살짝 올라가는 '이제 너'. 반주 없음. **2박(반 마디) / 4박 모두 지원** — 마디 길이 가변.
> 3. 따라하기(`response`) 마디 1박의 '네 차례' 지저귐 제거(약한 틱만) — 게임 본문에 이미 반영돼 있던 1줄 차이를 원본에도 반영.

톤: 차분하고 따뜻한 C 메이저. 선생님은 **낮고 둥근 손북 '둥'**, 내 앵무새는 **밝은 나무토막 '톡'**. 반주는 작게, 판정 소리는 탭 소리를 가리지 않을 만큼 아주 작게. 칭찬은 앵무새 지저귐(사인파 위아래 글라이드)으로 통일.

수치 기준은 `design.md`를 따른다: 4/4, 16분 그리드(마디당 16칸, `ready`처럼 짧은 마디는 박 수×4칸), BPM 90→94→98→102→106→110→116→122, Perfect ±45ms, Good ±100ms, 연타 방지 50ms, 보정값 −80~+400ms.

---

## 1. 믹스 구조

```
반주 musicBus(0.55) ─┐
선생님 teacherBus ───┴→ clockBus ─┐
효과음 sfxBus ───────────────────┴→ 컴프레서(−14dB, 6:1, knee 8, attack 3ms, release 180ms) ─┐
내 탭 tapBus ─────────────────────────────────────────────────────────────────────────┴→ master(0.8×볼륨) → 소프트 클리퍼 → 출력
```

- **내 탭은 컴프레서를 거치지 않는다.** 컴프레서는 룩어헤드 때문에 약 6ms 늦게 소리를 낸다(오프라인 렌더로 6.0ms 측정). 탭 소리는 조금이라도 빨라야 하므로 우회한다. 예약음(반주·선생님 북)은 전부 같은 6ms 지연을 받으므로 서로의 박은 어긋나지 않는다. 이 6ms는 `Beat.tapTime()`이 판정에서 자동으로 뺀다.
- **소프트 클리퍼**(WaveShaper, 오버샘플 없음 = 지연 0): ±0.6까지는 그대로 통과하고, 그 위는 tanh로 0.95에 부드럽게 수렴한다. 클리핑(찢어지는 소리) 방지용 안전망이다.
- 측정(오프라인 렌더, 반주+16분 패턴 북+16분 탭+levelUp·clear·combo·heartLost·perfect 동시 재생 최악의 경우): **피크 0.585 / 평균 −22.7 dBFS** → 클리핑 없음, 여유 충분.
- 재측정(2026-11-14, 부르기 반주 제거 후): 선생님 북 단독 출력 피크 0.52(accent 0.57). 부르기 마디 8분 북 + 8분 연습 탭(soft) 동시: **피크 0.58** → 선형 구간(±0.6) 안. 비현실적 최악(매 16분 탭+perfect, 매 마디 첫 박에 levelUp·combo·heartLost·phraseClear·clear 동시, 122 BPM): 피크 0.66 → 소프트 클리퍼가 부드럽게 처리(상한 0.95), 하드 클리핑 없음.
- 모든 엔벨로프는 0.0001에서 지수 어택 → 지수 감쇠(클릭 노이즈 방지).

## 2. 효과음 목록

피크는 각 버스 기준 값이다. 괄호 안은 오프라인 렌더로 잰 최종 출력 피크.

| 이름 (`play` / `Beat.schedule`) | 언제 | 합성 레시피 | 길이 |
|---|---|---|---|
| `teacher` `{accent}` | 부르기 마디의 패턴 음표. **반드시 `Beat.playPattern`/`Beat.schedule`로 예약** | sine 250→150Hz(60ms 동안 하강) 피크 0.50, 어택 1ms + triangle 500→290Hz 50ms(0.10) + lowpass 1.8kHz 노이즈 22ms(0.14). accent(마디 첫 칸)=음높이 ×1.12, 크기 ×1.15. 낮고 둥근 '둥' | 0.17s (출력 0.42) |
| `tap` `{soft}` | **내가 칠 때마다 즉시** (pointerdown/keydown, 판정 전에) | sine 760→700Hz 70ms(0.36), 어택 1ms + sine 1820Hz 35ms(0.10, 나무 배음) + bandpass 2.4kHz 노이즈 12ms(0.20). 밝은 '톡'. 25ms 스로틀(중복 이벤트 방지). `soft:true` = 절반 크기 | 0.07s (출력 0.30) |
| `perfect` | Perfect 판정 직후 | 10ms 뒤 sine C7 60ms(0.05) + 30ms 뒤 sine G7 50ms(0.025). 탭 위에 얹히는 작은 '칭' | 0.08s |
| `good` | Good 판정 직후 | 10ms 뒤 sine G6 45ms(0.035). 더 작은 '틱' | 0.05s |
| `miss` | 음표 시각 +100ms까지 탭이 없을 때 | triangle 160→105Hz 120ms(0.12) + lowpass 500Hz 노이즈 50ms(0.04). 둔한 '뚝' | 0.12s |
| `extra` (= `stray`) | 헛박(따라하기 마디에서 음표 없는 곳 탭) | 10ms 뒤 lowpass 700→250Hz 노이즈 60ms(0.08) + sine 110→80Hz 80ms(0.10). 막힌 '퍽'. 탭 소리 뒤에 붙는다 | 0.09s |
| `phraseClear` | 라운드 성공(판정 확정 = 따라하기 마디 끝 +100ms). 선생님 끄덕과 함께 | 앵무새 지저귐 2번: sine 1500→2500→2000Hz 90ms, 110ms 뒤 1700→2900→2300Hz 100ms (각 0.07) | 0.21s |
| `heartLost` | 라운드 실패(하트 −1) | triangle E5 120ms → C5 220ms(0.13) + sine 120→80Hz(0.12). 부드러운 하강 '따-단' | 0.34s |
| `heartGain` | 단계 무실패 하트 +1 | triangle C5 100ms → G5 220ms(0.11/0.12) + sine G6 반짝(0.025) | 0.32s |
| `combo` `{level}` | 콤보 배율이 오른 순간(콤보 8, 16, 24…). level = floor(콤보/8), 1~5 이상 | triangle base, base×1.25, base×1.5 (60ms 간격, 0.08/0.08/0.11) + sine base×3 반짝. base: 1=C5, 2=D5, 3=E5, 4=G5, 5이상=A5 | 0.32s |
| `levelUp` | 단계 전환 마디 시작. **`Beat.schedule(전환마디.time, 'levelUp')` 권장** | triangle C5-E5-G5-C6 60ms 간격(0.12) + sine E6(0.04) + 지저귐 + highpass 노이즈 쉬머(0.015) | 0.55s |
| `gameOver` | 하트 0 (반주는 `stopMusic(0.8)`로 따로 페이드) | triangle G4→E4→C4 280ms 간격(0.15) + sine C3(0.14) + 기운 빠진 지저귐 1400→900Hz(0.03) | 1.4s (출력 0.38) |
| `clear` | 8단계 통과 | square C5-E5-G5 100ms 간격(0.05) → triangle C6+G5+E5 화음 700ms + sine C3 + 지저귐 3번 상승 + 쉬머 | 1.0s (출력 0.49) |
| `newBest` | 결과 화면에서 새 기록일 때 | sine G5-C6-E6-G6 70ms 간격(0.08) + 지저귐 + 쉬머 | 0.45s |
| `count` `{n}` | 카운트인 막대 '딱' (반주가 `countin` 마디에서 자동 재생. 직접 부를 일 거의 없음) | sine 1500→1275Hz 40ms(0.12) + bandpass 3.5kHz 노이즈 15ms(0.10). n=4는 2000Hz | 0.04s |
| `start` | 시작 버튼 | 지저귐 + triangle C5 → G5 | 0.4s |
| `button` | 기타 버튼(보정 화면 다시/확인 등) | sine 880→660Hz 50ms(0.06) | 0.05s |
| `pause` / `resume` | 일시정지 / 계속 (pause는 `Beat.pause()` **전에** 재생 — suspend되면 안 들림) | sine A4→E4 / E4→A4 120ms(0.09) | 0.12s |

### 왜 이렇게 나눴나
- **선생님 vs 나**: 음역(150~250Hz vs 700~1800Hz)과 재질(가죽 북 vs 나무토막)이 둘 다 다르다. 부르기에서 들은 '둥'을 따라하기에서 '톡'으로 대답하는 구조라 귀로 누가 치는지 바로 안다.
- **어택**: 둘 다 1ms 어택 + 12~22ms 노이즈 트랜지언트로 시작점이 또렷하다. 판정 기준점이 귀에 분명해야 하기 때문.
- **판정 소리를 아주 작게**: 16분 연타(122 BPM에서 123ms 간격) 중에도 다음 탭 소리를 가리지 않도록 Perfect/Good은 탭보다 15~20dB 작고 50ms 남짓.

## 3. 반주 (박자감 + 차례 구분)

반주는 `Beat` 시계에 붙어 **끊김 없이** 흐른다. 마디마다 phase에 따라 편성이 바뀐다. 한 라운드 흐름: **부르기(4박) → 준비(2박 또는 4박) → 따라하기(4박)**.

### phase별 편성

| phase | 들리는 것 | 없는 것 |
|---|---|---|
| `countin` | 카운트인 '딱' 4번(4번째 높게) | 베이스·햇·코드 |
| `call` (부르기) | **선생님 북** + 정박 4개의 아주 약한 기준 틱 '칫' | 코드·베이스·하이햇·메트로놈 전부 |
| `ready` (준비, 2박/4박) | 박마다 부드러운 카운트 '똑', **마지막 박만** 위로 올라가는 '뾰?'(= 이제 너) | 반주 전부 |
| `response` (따라하기) | 베이스(1박) + 메트로놈(1박 약하게, 2·3·4박 약) + 하이햇(앤) + 내 '톡' | 코드 |
| `transition`/`rest` | 코드(C) + 베이스(1·3박) + 메트로놈 + 하이햇 | — |
| `silent` | 없음 | — |

### 레시피

| 요소 | 레시피 (피크는 musicBus 0.55 곱하기 전 값) | 언제 |
|---|---|---|
| 부르기 기준 틱 '칫' | sine 2400→2250Hz **14ms**, 피크 0.045, 어택 1ms, 노이즈 없음. 1박만 2500→2350Hz, 0.054(**크기 ×1.2, 음높이 +4%로 아주 미세한 강세**) | `call` 마디 칸 0·4·8·12. 측정 출력 피크 0.030(1박 0.036) = 선생님 북(0.52)보다 약 **−24dB**. 음역(2.4kHz vs 150~250Hz)·길이(14ms vs 170ms)·재질(순음 vs 가죽 북)이 모두 달라 북과 혼동되지 않게 |
| 준비 카운트 '똑' | triangle 1320→1250Hz 50ms, 피크 0.085, **어택 3ms**(카운트인 '딱'은 1ms) + bandpass 2.8kHz 노이즈 8ms(0.025, 카운트인은 0.10) → 카운트인보다 부드럽고 작게 | `ready` 마디 마지막 박을 뺀 박 |
| 준비 마지막 '뾰?' | sine 1760→2090Hz(A6→C7) 50ms 동안 상승, 75ms, 피크 0.095, 어택 3ms + bandpass 3.2kHz 노이즈 8ms(0.025). 물음표처럼 올라가는 "이제 너" | `ready` 마디 마지막 박(2박이면 2박째, 4박이면 4박째) |
| 메트로놈 강 | sine 1320Hz 35ms(0.13) + highpass 노이즈 8ms | `transition`/`rest` 1박 |
| 메트로놈 약 | sine 990Hz 25ms(0.065) | `response`·`transition`/`rest`의 2·3·4박, `response` 1박 |
| 하이햇 '츠' | highpass 7.5kHz 노이즈 28ms(0.07) | `response`·`transition`/`rest`의 8분 엇박(칸 2, 6, 10, 14) |
| 16분 하이햇 | 같은 소리 0.025 | `Beat.setBacking({hat16:true})`일 때 홀수 칸(같은 마디). **5단계(16분 등장)부터 켜기 권장** |
| 베이스 | sine 근음 + triangle 2배음(×0.25, 작은 스피커용) 피크 0.42, 1.6박 길이 | `response`·`rest` 1박, `rest` 3박(0.30) |
| 코드 | triangle 3화음(각 0.06, 3박은 0.04), 1.8박 감쇠 | **쉬는(전환) 마디만** 1박·3박 |
| 카운트인 '딱' | `count` 소리 4번(4번째 높게) | `countin` 마디 |

- **코드 진행(오리지널)**: 부르기 마디가 올 때마다 C → Am → F → G로 한 칸 진행(부르기 마디 자체는 소리 없음). 따라하기 마디의 베이스가 그 코드의 근음을 친다. 쉬는/전환 마디는 C.
- **부르기 vs 준비 vs 따라하기를 귀로 구분하는 단서** (글 없이 배우기):
  1. 부르기 = **조용한 바탕 위에 선생님 '둥'만**. 아주 작은 '칫'이 박을 짚어 줘서 엇박 '둥'이 박 사이에 있다는 것이 들린다.
  2. 준비 = '똑 똑 (똑 똑) 뾰?' — 세는 소리, 마지막이 올라가며 "이제 너".
  3. 따라하기 = 베이스가 '둥' 들어오고 햇 '츠'가 깔림 → 반주가 생긴다 = 내 차례. 내 '톡'은 코드가 없는 비어 있는 자리에서 잘 들린다.
- **대비 검토(부르기가 조용해진 뒤 따라하기와의 관계)**: 예전엔 "부르기 풍성 / 따라하기 비움"이었고 이제는 "부르기 비움(북만) / 준비 카운트 / 따라하기 그루브(베이스+햇)"로 뒤집혔다. 따라하기 1박에서 베이스가 처음 등장하는 것이 '시작' 신호 역할을 하므로 자연스럽다고 판단해 **따라하기 편성은 그대로 유지**했다(코드는 계속 빠짐 → 내 탭 공간 확보). 측정: 부르기 마디 평균 −59.6dBFS(틱만), 따라하기 마디 −28.5dBFS(반주만, 탭 제외). 따라하기 반주가 "갑자기 커진다"고 느껴지면 청취 확인 항목 3번에 따라 따라하기 하이햇을 0.07→0.05로 내리는 것이 1차 조정안.
- 정박/엇박: 부르기는 '칫'(박)과 '둥'(음표)의 상대 위치로, 따라하기는 메트로놈 틱(박)과 하이햇 '츠'(앤)로 → "틱 츠 틱 츠"로 앤 위치가 귀에 들어온다.

## 4. `Sound.Beat` — 박자 시계 API

모든 시각은 **AudioContext 초**(`ctx.currentTime` 기준). 스케줄러는 25ms마다 깨어나 **120ms 앞**까지 예약한다(design.md의 100ms보다 조금 넉넉하게. iPad 메인 스레드가 잠깐 멈춰도 끊기지 않도록). 칸 시각은 `마디 시작 + 칸 × stepDur`로 계산해 누적 오차가 없다. 마디 시작 시각은 마디마다 저장된다(BPM이 바뀌어도 정확).

| 함수 | 설명 |
|---|---|
| `Beat.start(bpm, {delay=0.1, phases})` | 시계 시작. 첫 마디(bar 0)는 지금+delay초. `phases`={마디번호: phase} 미리 예약 가능. 오디오가 아직 안 풀렸으면 `false` |
| `Beat.stop()` | 시계 정지. 이미 예약된 반주·선생님 음(최대 0.12초)은 40ms 페이드로 끊는다 |
| `Beat.setBpm(bpm)` | **다음에 예약되는 마디부터** 적용(마디 중간에 안 바뀜). 전환 마디부터 새 BPM이 되게 하려면 **직전 마디(마지막 따라하기)의 onBar에서** 호출 |
| `Beat.getBpm()`, `Beat.isRunning()` | |
| `Beat.onBar(fn)` | 마디 예약 순간(그 마디 시작 약 0.09~0.12초 전) 호출. `fn(info)`, `info = {bar, time, bpm, stepDur, beatDur, beats, steps, barDur, phase}`. **문자열을 반환하면 그 마디의 phase가 된다**: `'call'`, `'ready'`, `'response'`, `'countin'`, `'transition'`, `'rest'`, `'silent'`. **객체 `{phase, beats}`를 반환하면 phase와 마디 길이를 함께 정한다** (beats 1~8 정수, 기본 4, 범위 밖이면 4). 예: `return {phase:'ready', beats:2}` → 이 마디는 2박(8칸), 다음 마디는 정확히 2박 뒤 시작. 반환값(해제 함수) |
| `Beat.onStep(fn)` | 16분 칸마다 예약 순간 호출. `si = {step, bar, stepInBar(0~steps−1), beatInBar, sub(0~3), isBeat, isOffbeat8, time, stepDur, bpm, phase, barTime, beats, steps, late}`. `late=true`면 메인 스레드가 밀려 이미 지난 칸(반주는 생략됨). 반환값은 해제 함수 |
| `Beat.planPhase(bar, phase)` | 특정 마디 phase 예약. 문자열 또는 `{phase, beats}` (onBar 반환값이 우선) |
| `Beat.playPattern(info, steps, name='teacher')` | 마디 info와 칸 배열(예 `[0,4,6,10,12]`)로 선생님 북 예약. 칸 0은 accent. **반환: 각 음표의 ctx 시각 배열** → 그대로 `+ barDur` 하면 따라하기 마디 정답 시각 |
| `Beat.schedule(time, name, opts)` | 정확한 시각에 효과음 예약(이미 지났으면 즉시). 반환: 실제 시각 |
| `Beat.barTime(bar)` | 마디 시작 시각(예약된 마디는 정확, 미래는 현재 BPM + `planPhase`로 예약된 박 수(없으면 4박)로 추정 — onBar에서 나중에 길이를 정하는 마디는 추정에 반영 안 됨) |
| `Beat.ctxTime()` | `ctx.currentTime` |
| `Beat.heardTime()` | **지금 귀에 들리고 있는 소리의 ctx 시각.** `getOutputTimestamp()`로 계산, 없으면 `currentTime − outputLatency(또는 baseLatency)`. **플레이헤드·까딱임 등 화면 연출은 rAF에서 이 값으로 그린다** |
| `Beat.now(t?)` | 시각 → 박 위치 `{bar, phase, bpm, barTime, stepDur, beats, barDur, stepF(0~steps), beatF(0~beats), barF}`. t 생략 시 heardTime. `barF = bar + stepF/steps` |
| `Beat.tapTime(event)` | **판정용 탭 시각.** 이벤트 `timeStamp`를 "그 순간 들리던 소리의 시각"으로 바꾸고, 컴프레서 6ms와 사용자 보정을 뺀 값. **예약 시각(info.time, playPattern 반환값)과 바로 비교한다** |
| `Beat.latency()` | `{base, output, comp, offset, hasOutputTimestamp, sampleRate}` (디버그·보정 화면용) |
| `Beat.setOffset(ms)` / `getOffset()` | 사용자 보정, −80~+400 정수로 자름, localStorage `parrot-beat-offset` 저장(design.md와 같은 키·의미: +면 소리가 늦게 들림) |
| `Beat.pause()` / `resume()` / `isPaused()` | 일시정지 버튼용. `ctx.suspend()/resume()` → 오디오 시계 자체가 멈췄다가 이어진다. `resume()`은 "계속" 버튼 탭 핸들러 안에서 호출(iOS) |
| `Beat.setBacking({hat16})` | 반주 옵션 |

### 판정 연결 (design.md 공식과의 관계)
design.md: `오차 = tapCtx − (음표 예약 시각 + L)`, `tapCtx = currentTime − (performance.now() − timeStamp)/1000`, `L = outputLatency|baseLatency + offset`.
`Beat.tapTime(e)`는 이것과 같은 의미를 더 정확하게 계산한다(+ 컴프레서 6ms 포함):
```js
const errMs = (Sound.Beat.tapTime(e) - noteTime) * 1000;   // noteTime = 예약 시각 그대로
```
design.md 공식을 직접 쓰고 싶으면 `L`에 `Sound.Beat.latency().comp`(0.006)를 더한다. 둘 중 **하나만** 쓴다(중복 보정 금지).

### 연결 예시 (Developer 참고용 뼈대)
```js
const Beat = Sound.Beat;
const READY_BEATS = 2;                               // design.md가 정한 준비 길이(2 = 반 마디, 4 = 1마디)
Beat.onBar(info => {
  const ph = game.phaseForBar(info.bar);            // 'countin' | 'call' | 'ready' | 'response' | 'transition'
  if (ph === 'call') {
    game.callTimes = Beat.playPattern(info, game.patternSteps());
    game.callBarTime = info.time;
    // 따라하기 시작 = 부르기 시작 + 4박 + 준비 박 수 (부르기~따라하기 사이엔 BPM이 안 바뀐다)
    game.respStart = info.time + info.barDur + READY_BEATS * info.beatDur;
  }
  if (ph === 'ready') return { phase: 'ready', beats: READY_BEATS };
  if (ph === 'response') game.expected = game.callTimes.map(t => t - game.callBarTime + info.time); // info.time이 정확한 따라하기 시작
  if (game.nextBarIsTransition(info.bar)) Beat.setBpm(game.nextStageBpm()); // 다음 마디부터 새 BPM
  if (ph === 'transition') Beat.schedule(info.time, 'levelUp');
  return ph;
});
// 시작 버튼: Sound.unlock(); Sound.play('start'); Sound.startMusic({ bpm: 90 });  (bar 0을 'countin'으로)
// 치기: pointerdown/keydown → Sound.play('tap', {soft: phase !== 'response'}); 그다음 판정(Beat.tapTime(e))
```

## 5. Developer가 연결할 호출 지점

| 시점 | 호출 |
|---|---|
| 첫 사용자 제스처(시작 버튼, 이어폰 버튼, 모든 pointerdown/keydown) | `Sound.unlock()` (여러 번 불러도 안전) |
| 시작 버튼 | `Sound.unlock(); Sound.play('start'); Sound.startMusic({bpm: 90})` + onBar에서 bar 0 = `'countin'` |
| 매 마디 | `Beat.onBar` 콜백에서 phase 반환, 부르기면 `Beat.playPattern(info, steps)` |
| 준비 마디 (부르기 바로 다음) | onBar에서 `return {phase:'ready', beats: 2 또는 4}`. 카운트 소리는 반주가 자동으로 낸다(따로 호출 없음). **부르기 마디에서 따라하기 시작 시각을 `info.time + info.barDur`로 계산하던 코드는 `+ 준비박수 × info.beatDur`를 더해야 한다** |
| 단계 전환 | 직전 마디 onBar에서 `Beat.setBpm(새BPM)`, 전환 마디 onBar에서 `'transition'` 반환 + `Beat.schedule(info.time,'levelUp')`. 5단계부터 `Beat.setBacking({hat16:true})` |
| 치기 (pointerdown/keydown, 연타 방지 50ms 통과 후) | **즉시** `Sound.play('tap')` — 따라하기 마디가 아니면(부르기·준비 포함) `{soft:true}` |
| 판정 | Perfect → `play('perfect')`, Good → `play('good')`, 헛박 → `play('stray')` |
| 음표 +100ms까지 탭 없음 | `play('miss')` |
| 라운드 판정 확정 | 성공 `play('phraseClear')`, 실패 `play('heartLost')` |
| 단계 무실패 하트 회복 | `play('heartGain')` |
| 콤보 배율 상승 (콤보 8의 배수) | `play('combo', {level: Math.floor(combo/8)})` |
| 하트 0 | `play('gameOver'); Sound.stopMusic(0.8);` 0.8초 뒤 `Beat.stop()` |
| 8단계 클리어 | `Sound.stopMusic(0.8); play('clear');` 이후 `Beat.stop()` |
| 결과 화면 새 기록 | `play('newBest')` |
| 일시정지 | `play('pause')` 후 `Beat.pause()` / "계속": `Beat.resume(); play('resume')` → 다음 마디를 `'countin'` |
| 보정(캘리브레이션) 화면 | `Beat.start(90)` + 3마디 `'countin'`(클릭 12번). 탭 오차는 `Beat.tapTime(e) − 클릭시각` (이때는 offset을 0으로 두고 측정 후 `Beat.setOffset(중앙값)`) |
| 음소거 버튼 | `Sound.setMuted(!Sound.isMuted())`. 음소거해도 **시계·판정은 계속** 돈다(소리만 0) |
| 화면 연출 (rAF) | 플레이헤드·커서 = `Beat.now()` 또는 `Beat.heardTime()` 기준 |

- 탭 소리는 판정보다 **먼저**, 점수·DOM 갱신보다 먼저 호출한다.
- 버튼(Ⅱ, 음소거) 위 탭은 치기가 아니므로 `tap` 소리를 내지 않는다.

## 6. 오디오 시스템 · iPad Safari

- **잠금 해제**: 사용자 첫 터치/클릭 핸들러 안에서 `Sound.unlock()` → AudioContext 생성(`latencyHint:'interactive'`) + `resume()` + 1샘플 무음 버퍼 재생 + 무음 오실레이터 워밍업(첫 탭 지연 제거). 그 전의 `play()`는 조용히 무시된다.
- **음소거**: localStorage `parrot-beat-muted`(`'1'`/`'0'`), 읽기·쓰기 모두 try/catch. 마스터 게인을 20ms 동안 0으로.
- **탭 전환**: `visibilitychange` → 숨김이면 `ctx.suspend()`, 다시 보이면 `resume()`(단, `Beat.pause()`로 멈춘 상태면 그대로 둔다). suspend 동안 오디오 시계가 멈추므로 박자가 어긋나지 않고 이어진다. design.md대로 게임 쪽에서 일시정지 덮개를 띄우는 것은 Developer 몫.
- **iOS가 컨텍스트를 'interrupted'로 바꾸는 경우**(전화, 다른 앱 소리): 다음 탭의 `unlock()`에서 다시 resume된다. 그래서 모든 pointerdown에서 `unlock()`을 부르는 것을 권장.
- **무음 스위치/무음 모드**: iPad가 무음 상태면 Web Audio 소리가 **나지 않을 수 있다**(기기·iPadOS 버전에 따라 다름). 이 게임은 소리가 핵심이므로 시작 화면에 스피커 아이콘 등으로 "소리를 켜 주세요" 단서를 두는 것을 권장(art-ui 판단).
- **블루투스 이어폰**: 수백 ms 지연이 있고 Safari는 이를 보고하지 않을 수 있다 → design.md의 보정 화면으로 해결(`Beat.setOffset`).
- `getOutputTimestamp`/`outputLatency` 미지원 브라우저는 자동으로 `currentTime − baseLatency`로 대체한다.

## 7. 검증 결과 (Chromium, 헤드리스)

| 항목 | 방법 | 결과 |
|---|---|---|
| 문법 | `node --check` | 통과 |
| 예약 정확도(선생님 북) | OfflineAudioContext 48kHz 렌더, 120 BPM 칸 [0,4,6,10,12] 예약 vs 렌더된 소리 시작점 | 5개 모두 **+6.5ms 일정** = 컴프레서 6.0ms + 검출 임계 0.5ms. 흔들림 0.04ms 이내 |
| 예약 정확도(탭) | 같은 방법, 컴프레서 우회 경로 | +0.55ms(검출 임계값만큼) → 지연 없음 |
| 스케줄러(실시간) | 실제 AudioContext, 90 BPM 3마디 → 140 BPM, PC·iPad 에뮬레이션 | 16분 칸 간격 오차 **0µs**, 예약 여유 89~120ms(모든 칸이 소리보다 먼저 예약), late 0건, BPM 변경이 정확히 다음 마디(bar 3)부터 적용 |
| 시간 변환 | 탭 이벤트에서 `tapTime`/`heardTime`/`now` | heardTime이 currentTime보다 약 30~40ms 이전 시각(출력 지연만큼 뒤처짐, 정상), tapTime = heardTime − 6ms, 박 위치 계산 정상 |
| 클리핑 | 최악의 동시 재생 렌더 | 피크 0.585, 평균 −22.7dBFS |
| 음소거·보정 저장 | localStorage 확인 | `parrot-beat-muted`='1', `parrot-beat-offset` 999→400으로 잘림 |
| pause/resume | `Beat.pause()` 동안 ctx 시간 정지, resume 후 진행 | 정상 |
| stopMusic(0.8) | 페이드 동안 시계는 계속 | 정상, 콘솔 오류 0 |

### 2026-11-14 재검증 (부르기 반주 제거 + `ready` + 가변 마디)

| 항목 | 방법 | 결과 |
|---|---|---|
| 문법 | `node --check` | 통과 |
| 부르기 마디에 반주 없음 | OfflineAudioContext 48kHz, 100 BPM, 선생님 북 없이 반주만 렌더. 부르기 마디 3개 측정 | 전체 피크 **0.036**(기준 틱만), 평균 −59.6dBFS. 각 박 틱 뒤 40ms부터 다음 박 직전까지 피크 **0.0000~0.0001** = 코드·베이스·햇 음원 없음. 틱 피크 1박 0.036 / 2·3·4박 0.030 |
| 따라하기 마디 비교 | 같은 렌더 | 피크 0.37, 평균 −28.5dBFS (베이스·햇·메트로놈) |
| `ready` 2박 / 4박 길이 | 같은 렌더, 다음 마디 시작 시각 − ready 시작 시각 | 2박: **1.200000s**(기대 1.2), 4박: **2.400000s**(기대 2.4). 122 BPM 2박 뒤 마디 시작 3.050820s = 0.1 + 24칸×stepDur 정확 일치 |
| `ready` 카운트 타이밍 | 렌더된 소리 시작점 − 예약 박 시각 | 모든 박 +6.9~7.2ms 일정 (= 컴프레서 6ms + 어택 3ms 검출 임계). 박 간 흔들림 0.3ms 이내. 마지막 박 피크 0.076 > 다른 박 0.064 |
| 따라하기 1박 시작 | ready 뒤 response 첫 소리 | +6.56ms (다른 예약음과 같은 컴프레서 지연) |
| `Beat.now()` 가변 마디 | 2박 ready 중간(1.5박) 위치 | `{phase:'ready', beats:2, beatF:1.5, barF:bar+0.75}` 정상 |
| 클리핑 | 위 1장 재측정 | 현실적 최악 0.58(선형 구간), 비현실적 최악 0.66(소프트 클리퍼 처리) |
| 현재 게임과의 호환 | 게임 HTML 사본에 새 모듈만 교체, 시작 → 자동 플레이 20초 (Chromium) | countin → call → response 진행, Perfect 판정 정상, JS 오류 0 (기존 onBar 문자열 반환 방식 그대로 동작) |

**검증하지 못한 것**: 실제 소리(음색·크기 균형·귀 피로), 실제 Safari(WebKit)의 컴프레서 지연값(Chromium 6ms 기준으로 넣음)과 `getOutputTimestamp` 동작, 실기기 탭→소리 지연.

## 8. 청취 확인 필요 (실기기 iPad Safari + PC)

1. 선생님 '둥'과 내 '톡'이 확실히 다른 소리로 들리는가. 둘 다 시작점이 또렷한가.
2. 메트로놈 틱과 내 '톡'이 헷갈리지 않는가(헷갈리면 메트로놈 볼륨을 낮춘다).
3. "틱 츠 틱 츠"로 앤(엇박) 위치가 느껴지는가. 하이햇이 거슬리지 않는가.
4. (변경) 따라하기 마디 1박의 '네 차례' 지저귐은 제거됨. 대신 **준비 카운트의 마지막 '뾰?'가 "이제 너"로 들리는가, 그리고 '뾰?'를 쳐야 할 음표로 오해하지 않는가** — 가장 중요.
5. Perfect/Good 반짝이 16분 연타(122 BPM) 중에 다음 탭 소리를 가리지 않는가.
6. iPad 내장 스피커에서 베이스(F2 87Hz 등)가 들리는가(2배음을 넣었지만 확인 필요).
7. 2분 46초 한 판 동안 귀가 피곤하지 않은가. 볼륨 균형(선생님 > 내 탭 > 반주 > 판정음).
8. 탭 → 소리 지연 체감(iPad 내장 스피커, 유선/블루투스 이어폰 각각). 판정이 계속 한쪽으로 치우치면 보정 화면으로 해결되는가.
9. 무음 스위치/무음 모드에서 소리가 나는지, 탭 전환 후 돌아왔을 때 박자가 자연스럽게 이어지는지.
10. (신규) 부르기 마디에서 선생님 북이 또렷하게 들리는가. 기준 틱 '칫'이 너무 작아 엇박 위치를 잡는 데 도움이 안 되거나, 반대로 북과 섞여 음표처럼 들리지 않는가(조정: `guideTick` 피크 0.045/0.054).
11. (신규) 조용한 부르기 → 준비 카운트 → 반주가 들어오는 따라하기 흐름이 자연스러운가. 따라하기에서 반주가 갑자기 커진 느낌이면 하이햇 0.07→0.05로 낮춘다.
12. (신규) 준비 2박(반 마디)이 "내가 너무 바로 친다"는 느낌을 충분히 덜어 주는가(아니면 4박으로 — 사운드 쪽은 둘 다 준비됨).
