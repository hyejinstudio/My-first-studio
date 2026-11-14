# 박자 앵무새 (parrot-beat) — 사운드 명세

이 게임은 **소리가 핵심**이다. 모든 소리는 Web Audio API로 실시간 합성한다(음원 파일 없음, 오리지널 소리·코드 진행만 사용).
코드: `docs/games/parrot-beat/sound-module.js` → Developer가 `games/parrot-beat/index.html` 안의 독립 `<script>` 블록에 그대로 붙여 넣는다.

- 공통 API: `Sound = { unlock(), play(name, opts), setMuted(bool), isMuted(), startMusic(opts), stopMusic(fadeSec) }` (기존 게임과 같은 형태)
- 추가: `Sound.setVolume(0~1)`, `Sound.getVolume()`
- 리듬용: **`Sound.Beat`** — 박자 시계, lookahead 스케줄러, 판정용 시간 변환 (아래 4장)

톤: 차분하고 따뜻한 C 메이저. 선생님은 **낮고 둥근 손북 '둥'**, 내 앵무새는 **밝은 나무토막 '톡'**. 반주는 작게, 판정 소리는 탭 소리를 가리지 않을 만큼 아주 작게. 칭찬은 앵무새 지저귐(사인파 위아래 글라이드)으로 통일.

수치 기준은 `design.md`를 따른다: 4/4, 16분 그리드(마디당 16칸), BPM 90→94→98→102→106→110→116→122, Perfect ±45ms, Good ±100ms, 연타 방지 50ms, 보정값 −80~+400ms.

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

반주는 `Beat` 시계에 붙어 **끊김 없이** 흐른다. 마디마다 phase에 따라 편성이 바뀐다.

| 요소 | 레시피 | 언제 |
|---|---|---|
| 메트로놈 강 | sine 1320Hz 35ms(0.13) + highpass 노이즈 8ms | 1박 (따라하기 마디 1박 제외) |
| 메트로놈 약 | sine 990Hz 25ms(0.065) | 2·3·4박 |
| 하이햇 '츠' | highpass 7.5kHz 노이즈 28ms(0.07) | 8분 엇박(앤) — 칸 2, 6, 10, 14 |
| 16분 하이햇 | 같은 소리 0.025 | `Beat.setBacking({hat16:true})`일 때 홀수 칸. **5단계(16분 등장)부터 켜기 권장** |
| 베이스 | sine 근음 + triangle 2배음(×0.25, 작은 스피커용) 피크 0.42, 1.6박 길이 | 1박. 부르기·쉬는 마디는 3박에도(0.30) |
| 코드 | triangle 3화음(각 0.06, 3박은 0.04), 1.8박 감쇠 | **부르기·쉬는(전환) 마디만** 1박·3박 |
| '네 차례' 지저귐 | sine 1200→1900→1750Hz 80ms(0.10) + 약 메트로놈 | **따라하기 마디 1박** |
| 카운트인 '딱' | `count` 소리 4번(4번째 높게) | `countin` 마디. 베이스·햇·코드 없음 |

- **코드 진행(오리지널)**: 부르기 마디가 올 때마다 C → Am → F → G 순환. 따라하기 마디는 직전 부르기의 코드를 그대로 유지(질문-대답 느낌). 쉬는/전환 마디는 C.
- **부르기 vs 따라하기를 귀로 구분하는 단서** (글 없이 배우기):
  1. 부르기 마디 = 코드가 깔려 **풍성**, 선생님 '둥'.
  2. 따라하기 마디 = 코드가 빠지고 베이스 1번 + 메트로놈 + 햇만 남아 **비어 있음**(내 '톡'이 잘 들리는 자리). 1박에 앵무새 '삐잇?' 지저귐 = "네 차례".
  3. 카운트인 = 막대 '딱' 4번만.
- 정박/엇박: 박(1·2·3·4)은 메트로놈 틱, 엇박(앤)은 하이햇 '츠'로 은은하게 → "틱 츠 틱 츠"로 앤 위치가 귀에 들어온다.

## 4. `Sound.Beat` — 박자 시계 API

모든 시각은 **AudioContext 초**(`ctx.currentTime` 기준). 스케줄러는 25ms마다 깨어나 **120ms 앞**까지 예약한다(design.md의 100ms보다 조금 넉넉하게. iPad 메인 스레드가 잠깐 멈춰도 끊기지 않도록). 칸 시각은 `마디 시작 + 칸 × stepDur`로 계산해 누적 오차가 없다. 마디 시작 시각은 마디마다 저장된다(BPM이 바뀌어도 정확).

| 함수 | 설명 |
|---|---|
| `Beat.start(bpm, {delay=0.1, phases})` | 시계 시작. 첫 마디(bar 0)는 지금+delay초. `phases`={마디번호: phase} 미리 예약 가능. 오디오가 아직 안 풀렸으면 `false` |
| `Beat.stop()` | 시계 정지. 이미 예약된 반주·선생님 음(최대 0.12초)은 40ms 페이드로 끊는다 |
| `Beat.setBpm(bpm)` | **다음에 예약되는 마디부터** 적용(마디 중간에 안 바뀜). 전환 마디부터 새 BPM이 되게 하려면 **직전 마디(마지막 따라하기)의 onBar에서** 호출 |
| `Beat.getBpm()`, `Beat.isRunning()` | |
| `Beat.onBar(fn)` | 마디 예약 순간(그 마디 시작 약 0.09~0.12초 전) 호출. `fn(info)`, `info = {bar, time, bpm, stepDur, beatDur, barDur, phase}`. **문자열을 반환하면 그 마디의 phase가 된다**: `'call'`, `'response'`, `'countin'`, `'transition'`, `'rest'`, `'silent'`. 반환값은 해제 함수 |
| `Beat.onStep(fn)` | 16분 칸마다 예약 순간 호출. `si = {step, bar, stepInBar(0~15), beatInBar(0~3), sub(0~3), isBeat, isOffbeat8, time, stepDur, bpm, phase, barTime, late}`. `late=true`면 메인 스레드가 밀려 이미 지난 칸(반주는 생략됨). 반환값은 해제 함수 |
| `Beat.planPhase(bar, phase)` | 특정 마디 phase 예약(onBar 반환값이 우선) |
| `Beat.playPattern(info, steps, name='teacher')` | 마디 info와 칸 배열(예 `[0,4,6,10,12]`)로 선생님 북 예약. 칸 0은 accent. **반환: 각 음표의 ctx 시각 배열** → 그대로 `+ barDur` 하면 따라하기 마디 정답 시각 |
| `Beat.schedule(time, name, opts)` | 정확한 시각에 효과음 예약(이미 지났으면 즉시). 반환: 실제 시각 |
| `Beat.barTime(bar)` | 마디 시작 시각(예약된 마디는 정확, 미래는 현재 BPM으로 추정) |
| `Beat.ctxTime()` | `ctx.currentTime` |
| `Beat.heardTime()` | **지금 귀에 들리고 있는 소리의 ctx 시각.** `getOutputTimestamp()`로 계산, 없으면 `currentTime − outputLatency(또는 baseLatency)`. **플레이헤드·까딱임 등 화면 연출은 rAF에서 이 값으로 그린다** |
| `Beat.now(t?)` | 시각 → 박 위치 `{bar, phase, bpm, barTime, stepDur, stepF(0~16), beatF(0~4), barF}`. t 생략 시 heardTime |
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
Beat.onBar(info => {
  const ph = game.phaseForBar(info.bar);            // 'countin' | 'call' | 'response' | 'transition'
  if (ph === 'call') game.callTimes = Beat.playPattern(info, game.patternSteps());
  if (ph === 'response') game.expected = game.callTimes.map(t => t + info.barDur);
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
| 단계 전환 | 직전 마디 onBar에서 `Beat.setBpm(새BPM)`, 전환 마디 onBar에서 `'transition'` 반환 + `Beat.schedule(info.time,'levelUp')`. 5단계부터 `Beat.setBacking({hat16:true})` |
| 치기 (pointerdown/keydown, 연타 방지 50ms 통과 후) | **즉시** `Sound.play('tap')` — 따라하기 마디가 아니면 `{soft:true}` |
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

**검증하지 못한 것**: 실제 소리(음색·크기 균형·귀 피로), 실제 Safari(WebKit)의 컴프레서 지연값(Chromium 6ms 기준으로 넣음)과 `getOutputTimestamp` 동작, 실기기 탭→소리 지연.

## 8. 청취 확인 필요 (실기기 iPad Safari + PC)

1. 선생님 '둥'과 내 '톡'이 확실히 다른 소리로 들리는가. 둘 다 시작점이 또렷한가.
2. 메트로놈 틱과 내 '톡'이 헷갈리지 않는가(헷갈리면 메트로놈 볼륨을 낮춘다).
3. "틱 츠 틱 츠"로 앤(엇박) 위치가 느껴지는가. 하이햇이 거슬리지 않는가.
4. 따라하기 마디가 "비어서 내 차례"로 느껴지는가. 1박의 '네 차례' 지저귐이 음표(쳐야 할 소리)로 오해되지 않는가 — **가장 중요**. 오해되면 지저귐을 없애고 코드 유무만으로 구분.
5. Perfect/Good 반짝이 16분 연타(122 BPM) 중에 다음 탭 소리를 가리지 않는가.
6. iPad 내장 스피커에서 베이스(F2 87Hz 등)가 들리는가(2배음을 넣었지만 확인 필요).
7. 2분 46초 한 판 동안 귀가 피곤하지 않은가. 볼륨 균형(선생님 > 내 탭 > 반주 > 판정음).
8. 탭 → 소리 지연 체감(iPad 내장 스피커, 유선/블루투스 이어폰 각각). 판정이 계속 한쪽으로 치우치면 보정 화면으로 해결되는가.
9. 무음 스위치/무음 모드에서 소리가 나는지, 탭 전환 후 돌아왔을 때 박자가 자연스럽게 이어지는지.
