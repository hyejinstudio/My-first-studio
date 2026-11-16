# 작은 회사 사장님 (tiny-company) — 사운드 명세

모든 소리는 Web Audio API로 실시간 합성한다(음원 파일 없음). 코드: `docs/games/tiny-company/sound-module.js` — Developer가 `games/tiny-company/index.html`의 독립 `<script>` 블록에 그대로 붙여 넣는다(`_test` 부분 포함해도 무해).

**톤 원칙**: 작고 아늑한 사무실. 나무 책상 '똑', 종이, 도장, 타자기, 탁상 시계, 마림바·일렉피아노. 버저·사각파·날카로운 고음 없음(효과음 버스 7kHz 로우패스). 슬라이더 틱·버튼처럼 자주 나는 소리일수록 작고 짧다. 나쁜 소식(적자·퇴사·나쁜 이벤트)도 "아쉬움" 정도로, 놀라게 하지 않는다.

조성: F 장조로 효과음·BGM 통일. 모든 멜로디는 오리지널.

## 1. 신호 경로

```
sfxBus → lowpass 7kHz ───────────────────────────────────────────┐
musicBus(0.16) → musicReport(리포트 시 0.5) → musicDuck(순간 덕킹) ┴→ master(0.6, 음소거) → limiter → 출력
```
- **마스터 리미터**: DynamicsCompressor threshold −6 dBFS, knee 2, ratio 20, attack 2ms, release 150ms.
- **리포트 모드**: `Sound.setReportMode(true)` → 음악 0.5배(약 −6 dB, 시정수 0.15s), `false` → 원래대로(0.4s).
- **순간 덕킹**: loss / quit / eventGood / eventBad / bankrupt / allQuit / yearClear / best 재생 시 음악 0.5배로 0.8~2.2초 낮춘 뒤 서서히 복귀.
- 엔벨로프는 0.0001에서 지수 어택/감쇠(클릭음 방지). 노이즈 버퍼 0.6초 고정 시드, 재생 위치 무작위.

## 2. 효과음 목록

피크는 Chromium OfflineAudioContext 48kHz 렌더 측정값(마스터·리미터 통과 후, 음악 없음).
"마림바" = sine 기음 + 4배음(18%, 80ms 이내 소멸). "건반" = sine 기음 + 2배음 0.25 + 3배음 0.06, 로우패스 2.6→1kHz, 150ms에 40%로 감쇠 후 소멸.

| 이름 (`Sound.play`) | 언제 | 합성 레시피 | 길이 | 피크 |
|---|---|---|---|---|
| `tick` | 슬라이더(월급·업무량·휴식)가 눈금 하나 이동할 때 | triangle 900~1510Hz(`opts.value` 0~1에 비례) → 8% 하강 28ms(0.07) + 3.5kHz 노이즈 12ms. **60ms 스로틀**(빠르게 드래그해도 최대 약 16회/초) | 0.03s | −26 dB |
| `button` | 일반 UI 버튼 | sine 700→560Hz 60ms(0.10) + 2.5kHz 노이즈 20ms. 50ms 스로틀 | 0.06s | −21 dB |
| `hire` | 직원 채용 확정 | 도장 '탁'(sine 180→90Hz + 로우패스 노이즈) → 마림바 C5-F5-A5 상승(80ms 간격) | 0.7s | −10 dB |
| `work` | 한 달 진행 연출 시작 | `opts.duration`초(0.5~8, 기본 2.5) 동안: 탁상 시계 0.5초마다 틱/톡(triangle 1.9k/1.5kHz 20ms) + 타자기 타건 3~6타 묶음(밴드패스 노이즈 2.2~3.4kHz 22ms + sine 260→140Hz '툭', 간격 75~125ms, 묶음 사이 0.18~0.43s 쉼) + 끝 0.25초 전 캐리지 '스륵' + 벨 '띵'(sine 1760Hz 0.5s + 4420Hz). `Sound.stopWork()`로 즉시 중단 가능 | duration | −20 dB |
| `nextMonth` | 다음 달 시작(달력 넘김) | 밴드패스 노이즈 1.2→3.2kHz 180ms(종이 넘김) + 마림바 F5 | 0.45s | −19 dB |
| `coin` | 매출 증가 / 흑자 표시 | 동전 '찰랑': sine 0.75f 50ms → f 320ms + 2.76f 비조화 배음(금속감). `opts.count`(1~4) 회 반복, C6-D6-E6-F6로 한 음씩 상승(90ms 간격). 120ms 스로틀 | 0.4~0.7s | −17 dB |
| `loss` | 적자 발생 | triangle D4 → Bb3 하강(둘 다 살짝 처짐) + sine Bb2 받침. 버저 없음 | 0.75s | −13 dB |
| `report` | 월말 리포트 등장 | 종이 '스윽'(노이즈 1→3kHz) + 건반 F5 → C6 (탁상 벨 느낌) | 1.0s | −14 dB |
| `happy` | 직원 행복도 상승(눈에 띄는 상승 시) | 마림바 A5 → C6(80ms) + sine F6 작은 반짝임 | 0.45s | −16 dB |
| `tired` | 피로 경고(위험 수준 진입) | triangle E4 '톡' → 반음 아래 '톡'(180ms 간격). 경보음 아님. 500ms 스로틀 | 0.4s | −18 dB |
| `quit` | 직원 퇴사 | 문 '쿵'(sine 110→55Hz 220ms + 로우패스 노이즈) + 걸쇠 '철컥'(2.4kHz 노이즈 30ms + 900Hz) → 건반 A4 → F4(살짝 처짐) 아쉬운 하강 | 1.3s | −12 dB |
| `eventGood` | 좋은 이벤트 카드 공개 | 카드 '착'(노이즈 2→1.2kHz) + 마림바 F5-A5 + 건반 C6 | 0.8s | −16 dB |
| `eventBad` | 나쁜 이벤트 카드 공개 | 카드 '착' + 건반 C5 → A4(살짝 처짐) + sine Bb3(살짝 불협) | 0.8s | −14 dB |
| `bankrupt` | 게임오버: 파산 | 금고 '텅'(sine 75→45Hz + 노이즈) + 건반 F4-D4-Bb3-F3 느린 하강(280ms 간격, 점점 처짐) + Bb2 받침 | 2.1s | −10 dB |
| `allQuit` | 게임오버: 전원 퇴사 | 문 닫힘 + 빈 사무실 시계 째깍 3번 + 건반 C5 → A4 → F4 (외로운 하강) | 2.4s | −11 dB |
| `yearClear` | 12달 완주 결과 화면 | 마림바 F4-A4-C5-F5(120ms 간격) → F5+A5+C6 건반 화음 + F3 받침 | 1.6s | −11 dB |
| `best` | 새 최고 기록 | 마림바 A5-C6-D6-F6(80ms) + C6 벨 + 아주 작은 고역 노이즈 반짝임. `yearClear` 약 1.2초 뒤 권장 | 1.2s | −16 dB |

레벨 의도: 조작음(tick·button) −21~−26 dB < 진행음(work·nextMonth·happy·tired·coin) −16~−20 dB < 결과음(loss·report·quit·event) −12~−16 dB < 게임 종료·채용 −10~−11 dB.

`eventGood`/`eventBad`는 같은 스로틀 키(300ms), `bankrupt`/`allQuit`도 같은 키(500ms)를 써서 실수로 둘 다 불려도 하나만 난다.

## 3. 배경음악

- **오리지널 F 장조 사무실 루프**: 92 BPM, 8분음표 스텝, 8마디(64스텝) ≈ **20.9초** 루프.
- 화음(2마디씩): `Fmaj7(A3 C4 E4 / 베이스 F2)` → `Am7(G3 C4 E4 / A2)` → `Bbmaj7(A3 D4 F4 / Bb2)` → `C7sus4(Bb3 D4 F4 / C3)`.
- 파트:
  - 베이스: triangle, 1박 루트(3.5스텝) + 3박 5도, 둘째 마디 끝 8분에 경과음(루트 +온음).
  - 코드: sine 일렉피아노(2배음 약간), 2·4박 오프비트(스텝 2, 6) + 둘째 마디 5번째 스텝 짧게.
  - 셰이커: 하이패스 6kHz 노이즈 40ms, 8분마다(뒷박 0.05, 정박 0.025).
  - 나무 블록: sine 1250→1100Hz 30ms, 2·4박.
  - 멜로디(마림바): 짝수 루프 A안 / 홀수 루프 B안을 번갈아, **4번째 루프마다 멜로디 쉼**(반주만)으로 반복 피로를 줄인다.
    - A안(스텝:음): 2 C5, 4 A4, 7 C5, 8 D5 | 18 E5, 20 C5, 23 A4, 24 G4 | 34 F4, 36 A4, 38 D5, 40 C5 | 50 Bb4, 52 A4, 54 G4, 56 C5
    - B안: 2 A4, 4 C5, 6 F5 | 18 E5, 21 D5, 22 C5, 24 E5 | 34 D5, 36 F5, 39 E5, 40 D5 | 50 C5, 52 D5, 54 Bb4, 56 A4
- 레벨: 측정 RMS **−43.6 dBFS**, 피크 −23.6 dB (효과음 결과음보다 약 10~13 dB 아래). 리포트 모드에서 RMS −49.5 dBFS.
- 스케줄러: `setTimeout` 150ms 주기, 0.5초 룩어헤드, `ctx.currentTime` 기준 예약. 탭 복귀 등으로 0.3초 이상 밀리면 밀린 음을 몰아 치지 않고 현재 시점으로 다시 맞춘다.
- `stopMusic()`은 약 1초 페이드아웃 후 예약된 음 정리. 페이드 중 `startMusic()`은 끊김 없이 복귀.
- 재생 구간 권장: 게임 시작 ~ 게임오버/1년 결과 화면 전까지 계속. 한 달 진행 연출(`work`) 중에도 그대로 둔다.

## 4. 오디오 시스템

### API
```
Sound.unlock()                 사용자 제스처 안에서 호출(여러 번 안전)
Sound.play(name, opts?)        효과음. opts: tick {value:0~1}, work {duration:초}, coin {count:1~4}
Sound.stopWork()               진행 중인 work(타자기/시계) 소리 즉시 중단 (연출 건너뛰기 시)
Sound.setMuted(bool) / Sound.isMuted()
Sound.setReportMode(bool)      월말 리포트 동안 음악 살짝 낮춤 / 복귀
Sound.startMusic() / Sound.stopMusic()
```
공통 인터페이스 `{unlock, play, setMuted, isMuted, startMusic, stopMusic}`를 지키고, `stopWork`·`setReportMode`는 이 게임 전용 추가 메서드다. 알 수 없는 이름, unlock 전 호출, 음소거 중 `play()`는 조용히 무시된다.

### 음소거
- localStorage 키 `tiny-company-muted` (`'1'` 음소거 / `'0'` 켬). 로드 시 읽고 `setMuted()` 때 저장. 읽기·쓰기 모두 try/catch — 저장소가 막힌 환경에서도 기본값(소리 켬)으로 동작.
- 음소거는 마스터 게인을 20ms 시정수로 0으로. 음악 스케줄러는 계속 돌아 해제 시 곡 중간부터 이어진다.
- UI: 🔊/🔇 버튼, 초기 표시는 `Sound.isMuted()`로. 버튼 핸들러에서도 `Sound.unlock()` 먼저.

### iPad Safari
- AudioContext는 **첫 사용자 제스처(click/touchend/pointerup/keydown) 안에서** `Sound.unlock()`으로 생성·`resume()`하고 1샘플 무음 버퍼를 재생해 iOS 출력 경로를 연다. `touchstart`보다 `touchend`/`click`이 확실하다. 슬라이더 드래그(input 이벤트)는 제스처로 인정되지 않을 수 있으므로 시작 버튼에서 반드시 unlock 한다.
- **무음 스위치/무음 모드**가 켜져 있으면 Web Audio 소리가 나지 않을 수 있다(게임 오류 아님). 도움말에 "소리가 안 나면 무음 모드를 확인하세요" 한 줄 권장.
- 탭 전환/홈 이동: `visibilitychange`에서 `ctx.suspend()`, 복귀 시 `resume()` (모듈이 자동 처리).
- AudioContext 미지원·생성 실패 시 모든 메서드는 무시되고 게임은 정상 진행.

## 5. Developer 호출 지점

| 위치 | 호출 |
|---|---|
| 모든 사용자 입력 핸들러(시작, 버튼, 슬라이더 pointerdown, keydown, 음소거 버튼) 맨 앞 | `Sound.unlock()` |
| 게임 시작 버튼 | `Sound.play('button'); Sound.startMusic();` |
| 일반 버튼(도움말, 닫기, 다시하기 등 — 아래 전용 소리가 있는 버튼은 그것만) | `Sound.play('button')` |
| 슬라이더 값이 눈금 하나 바뀔 때(`input` 이벤트에서 **값이 실제로 바뀐 경우만**) | `Sound.play('tick', { value: (v - min) / (max - min) })` |
| 채용 확정 | `Sound.play('hire')` |
| "이번 달 진행" 버튼 → 한 달 진행 연출 시작 | `Sound.play('work', { duration: 연출초 })` (연출 길이와 맞춤) |
| 연출 건너뛰기(탭으로 스킵 등) | `Sound.stopWork()` |
| 월말 리포트 표시 | `Sound.setReportMode(true); Sound.play('report');` 그 뒤 약 0.5초 간격으로 해당하는 것만: |
| └ 이번 달 흑자/매출 증가 | `Sound.play('coin', { count: 1~4 })` (증가 폭에 따라) |
| └ 이번 달 적자 | `Sound.play('loss')` (coin과 동시에 쓰지 않음) |
| └ 평균 행복도 눈에 띄게 상승 | `Sound.play('happy')` |
| └ 피로 위험 수준 진입(직원 1명 이상) | `Sound.play('tired')` |
| └ 퇴사자 발생 | `Sound.play('quit')` (여러 명이어도 1회) |
| 이벤트 카드 공개 | `Sound.play('eventGood')` 또는 `Sound.play('eventBad')` |
| 리포트 닫고 다음 달로 | `Sound.setReportMode(false); Sound.play('nextMonth');` |
| 게임오버: 파산 | `Sound.stopWork(); Sound.setReportMode(false); Sound.stopMusic(); Sound.play('bankrupt');` |
| 게임오버: 전원 퇴사 | `Sound.stopWork(); Sound.setReportMode(false); Sound.stopMusic(); Sound.play('allQuit');` |
| 12달 완주 결과 화면 | `Sound.setReportMode(false); Sound.stopMusic(); Sound.play('yearClear');` |
| 새 최고 기록 | `yearClear` 약 1.2초 뒤 `Sound.play('best')` |
| 다시하기 | `Sound.play('button'); Sound.startMusic();` |
| 음소거 버튼 | `Sound.setMuted(!Sound.isMuted())` + 아이콘 갱신 |

리포트에서 여러 소리를 한꺼번에 부르면 뭉개진다. 리포트 항목 애니메이션 순서대로 0.4~0.6초 간격을 두거나, 가장 중요한 1~2개만 재생하는 것을 권장한다.

## 6. 검증 기록

| 항목 | 방법 | 결과 |
|---|---|---|
| 문법 | `node --check sound-module.js` | 통과 |
| 레벨·클리핑 | Chromium OfflineAudioContext 48kHz 스테레오, 효과음 17개 개별 렌더(t=0.3s 시작) | 피크 −10.3 ~ −25.8 dBFS, 클리핑 0 |
| 슬라이더 연타 | tick 15ms 간격 20회 호출 | 스로틀로 약 5회만 발음, 피크 −23.7 dB, 클리핑 0 |
| 배경음악 | 2루프(약 42.7초) 렌더 | RMS −43.6 dBFS, 피크 −23.6 dBFS, 클리핑 0 |
| 리포트 모드 | 1루프 렌더, reportMode on | RMS −49.5 dBFS (약 −6 dB) |
| 최악 겹침 | 음악 + yearClear·best·coin·hire·quit·eventGood·report·work·bankrupt 동시 | 피크 −5.2 dBFS(리미터 동작), 클리핑 0 |
| 실시간 API | Chromium iPad 에뮬레이션: unlock 전 play/startMusic/setReportMode/stopWork 무시, 탭(touchend) 후 전 효과음+없는 이름, stopWork, reportMode on/off, 음소거 토글, stop→start(페이드 중 재시작), stop 완료 후 재시작 | 페이지 오류 0. localStorage 접근 차단 상태에서도 예외 없음 |

**청취 확인 필요(미검증)**: 헤드리스 환경이라 실제 소리는 듣지 못했다. 실기기에서 ① 슬라이더를 빠르게 끌 때 tick이 거슬리지 않는지(거슬리면 스로틀 0.06→0.1), ② `work`가 타자기·시계처럼 들리는지, ③ `coin`이 동전처럼 들리는지, ④ `quit`의 문 닫힘이 iPad 스피커에서 들리는지(저음 110Hz라 작은 스피커에선 약할 수 있음 — 걸쇠 '철컥'과 아쉬운 2음이 주 신호), ⑤ BGM이 경쾌하되 오래 들어도 피곤하지 않은지와 크기(조정은 `MUSIC_VOL` 0.16), ⑥ 리포트 모드 감소량이 적당한지(`REPORT_LEVEL` 0.5), ⑦ iPad Safari 첫 터치 후 소리·무음 스위치 동작, ⑧ 탭 전환 후 복귀 시 재개를 확인해야 한다.
