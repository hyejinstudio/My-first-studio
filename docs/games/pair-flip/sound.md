# 짝꿍 카드 (pair-flip) — 사운드 명세

모든 소리는 Web Audio API로 실시간 합성한다(음원 파일 없음). 코드: `docs/games/pair-flip/sound-module.js` — Developer가 `lab/games/pair-flip/index.html`의 독립 `<script>` 블록에 그대로 붙여 넣는다(`_test` 부분 포함해도 무해).

**톤 원칙**: 나무 테이블 위 종이 카드. 카드 마찰음·마림바·작은 종('딩'). 버저·사각파 없음(효과음 버스 8kHz 로우패스). **빠르게 연타하는 기록 게임**이라 가장 자주 나는 소리(카드 '탁')가 가장 작고 짧다. 틀림은 "아, 아니네" 정도의 낮은 음 하나 — 30번 들어도 짜증나지 않게.

조성: C 장조(5음 음계 위주)로 효과음·BGM 통일. 모든 멜로디는 오리지널.

## 0. 기획 확정 타이밍 (CEO 2026-11-26)과 소리 대응

| 게임 이벤트 | 시간 | 소리 |
|---|---|---|
| 미리보기(전체 앞면) | 6.0초 | 남은 3·2·1초에 `tick`(1초에는 `{last:true}`) |
| 전체 뒤집힘 | 0.3초 | `flipAll` (기본 길이 0.3초 = 이 값) — 끝나는 순간 작은 마림바 2음 = "시작" |
| 카드 한 장 뒤집기 | 0.15초, pointerdown 즉시 | `flip` (~30ms라 애니메이션보다 짧음) |
| 두 번째 카드가 열리는 순간, 짝 맞음 | 즉시 판정 | `flip` + `match({combo})` 같은 순간에 |
| └ 사라짐 연출 | 0.35초 | 별도 소리 없음(`match` 꼬리 ~0.3초가 사라짐과 겹침) |
| 두 번째 카드가 열리는 순간, 틀림 | 즉시 판정 | `flip` + `miss` 같은 순간에 |
| └ 0.8초 보여 준 뒤 덮임 | 0.8초 후 | `flip({back:true})` **한 번만**(두 장 동시여도 25ms 스로틀로 하나만 남) |
| 마지막 짝 | 즉시 | `flip` + `clear` (`match` 대신) |
| 결과 화면에서 새 기록 | clear 뒤 ≥1.0초 | `record` |

판 크기: 24장(12쌍), 한 판 25~90초 → `flip` 약 24~100회, `match` 11회 + `clear` 1회, `miss` 0~40회. 그래서 `flip`·`miss`의 음량·길이를 가장 보수적으로 잡았다.

## 1. 신호 경로

```
sfxBus → lowpass 8kHz ──────────────────┐
musicBus(0.10) → musicDuck(순간 덕킹) ──┴→ master(0.6, 음소거) → limiter → 출력
```
- **마스터 리미터**: DynamicsCompressor threshold −6 dBFS, knee 2, ratio 20, attack 2ms, release 150ms.
- **순간 덕킹**: `clear`(1.6초)·`record`(2.0초) 때 음악 0.4배로 낮춘 뒤 서서히 복귀.
- **`flip` 동시 발음 제한**: 전용 보이스 풀 최대 3개. 넘치면 가장 오래된 소리를 약 10ms 안에 줄여 없앤다. 25ms 스로틀.
- **`flip` 연속 자동 축소**: 직전 flip과의 간격 gap(초)으로 음량 계수 = clamp(0.6 + 2·gap, 0.6, 1) → 0.2초 이상 1.0, 80ms 0.76, 30ms 0.66.
- **판정 소리 하나만**: `match`·`miss`는 같은 스로틀 키(80ms) — 실수로 둘 다 불려도 하나만 난다.
- 엔벨로프는 0.0001에서 지수 어택/감쇠(클릭음 방지). 노이즈 버퍼 0.6초 고정 시드, 재생 위치 무작위.

## 2. 효과음 목록

피크는 Chromium OfflineAudioContext 48kHz 렌더 측정값(마스터·리미터 통과 후, 음악 없음, 리미터 워밍업 0.3초 뒤에 재생).
"마림바" = sine 기음 + 4배 배음(10%, 30ms 이내 소멸). "종" = sine 기음 + 2배(28%, 짧게) + 3배(8%, 더 짧게).

| 이름 (`Sound.play`) | 언제 | 합성 레시피 | 길이 | 피크 |
|---|---|---|---|---|
| `button` | 일반 UI 버튼(시작, 다시하기, 도움말 등) | sine 660→520Hz 55ms + 밴드패스 노이즈 2.5kHz 20ms. 50ms 스로틀 | 0.06s | −21.3 dB |
| `tick` | 미리보기 남은 3·2·1초 | 밴드패스 노이즈 2.2kHz 15ms + 마림바 G5 0.16s. `{last:true}`면 C6, 약간 크게. 200ms 스로틀 | 0.12s | −24.6 dB (last −22.1) |
| `flipAll` | 미리보기 끝, 전체 뒤집힘 시작 순간 | '촤르륵': 밴드패스 노이즈 클릭 18ms × (길이×30, 10~16)개, 가운데가 촘촘(코사인 분포), 2.6→3.5kHz 상승·±10% 무작위 + 바람(밴드패스 노이즈 900→3200Hz, 느린 어택) + 끝에 마림바 C5·G5(60ms 차). `{dur}` 0.2~1.2초, 기본 0.3 | 0.3s + 꼬리 0.25s | −23.9 dB |
| `flip` | 카드 한 장 뒤집을 때(pointerdown 즉시) | 종이 '탁': 밴드패스 노이즈 3.2→2.2kHz(Q 1.3) 22ms + 나무 '톡' sine 1300→800Hz 25ms. 음높이 ±4% 무작위. 연속 자동 축소. `{back:true}`(덮일 때)는 ×0.6 음량, ×0.85 음높이 | 0.03s | −27.1 dB (back −31.1) |
| `match` | 짝 맞음(두 번째 카드 열림과 동시) | 종 f 0.45s + 50ms 뒤 종 1.5f(5도 위, 작게). `{combo}`(1부터): C 장조 5음 음계 E5-G5-A5-C6-D6-E6-G6-A6 한 칸씩 상승(8 이상 A6 고정). 콤보 5 이상이면 2f 반짝임 추가 | 0.31s | −17.3 ~ −16.9 dB |
| `miss` | 틀림(두 번째 카드 열림과 동시) | '뚱': sine B3→A3 0.26s(어택 10ms) + triangle 한 옥타브 아래 작게 + 600Hz 로우패스 노이즈 30ms 살짝. 고음·하강 멜로디 없음 | 0.19s | −20.5 dB |
| `clear` | 마지막 짝을 맞힌 순간(`match` 대신) | 마림바 C5-E5-G5-C6 상승(80ms) + 종 E6 + sine C5·E5·G5 화음 1.1s + triangle C3 받침. 음악 덕킹 | 1.07s | −14.4 dB |
| `record` | 결과 화면에서 새 기록(최고 기록 갱신)일 때 | 마림바 G5-A5-C6-D6-E6-G6 빠른 상승(55ms) + 종 C6 + F 화음(F4 A4 C5 / F3) → C 화음(E4 G4 C5 / C3) + 종 G6. 음악 덕킹 | 1.54s | −13.1 dB |

레벨 의도: flip(−27) < tick·flipAll(−24) < button·miss(−21) < match(−17) < clear·record(−13~−14).
- `flip`은 match보다 약 10 dB 작아 연타해도 배경 질감으로 묻히고, `match`의 '딩'이 귀에 분명하다.
- `miss`는 match보다 3 dB 작고 저역(220~250Hz)이라 '딩'(660Hz~1.8kHz)과 음색·음역이 확실히 다르다. 처음엔 −15 dB였으나 "짜증나지 않게" 기준으로 −20.5 dB로 낮췄다.
- 콤보가 올라가도 피크가 거의 같다(−17.3 → −16.9) — 음만 올라가고 커지지 않는다.

## 3. 배경음악 (선택 — **기본 꺼짐**)

**결정: 기본 꺼짐.** 이유: 시간 기록 경쟁·기억 집중 게임이라 음악이 주의를 흩뜨리고, `flip`·`match`의 리듬 피드백이 사실상 음악 역할을 한다. 켜고 싶은 사람을 위해 🎵 버튼으로 켤 수 있고 설정은 저장된다.

- **오리지널 C 장조 '찻집' 루프**: 72 BPM, 8분음표 스텝, 8마디(64스텝, 약 26.7초).
- 화음(2마디씩): `Cmaj7(E4 G4 B4 / C3)` → `Am7(E4 G4 C5 / A2)` → `Fmaj7(E4 A4 C5 / F2)` → `G6(D4 G4 B4 / G2)`.
- 패드(sine, 어택 0.4s, 마디마다) + 베이스(triangle 1박 루트, 짝수 마디 3박 5도) + 성긴 마림바 멜로디(2마디에 3음). A안/B안 번갈아, **3번째 루프마다 멜로디 쉼**.
  - A안(스텝:음): 2 G5, 5 E5, 10 D5 | 18 C5, 21 E5, 26 A5 | 34 A5, 37 G5, 42 E5 | 50 D5, 53 G5, 58 D5
  - B안: 2 E5, 5 G5, 10 C6 | 18 A5, 21 G5, 26 E5 | 34 C5, 37 D5, 42 E5 | 50 G5, 53 D5, 58 C5
- 레벨(측정, 54초): RMS **−49.4 dBFS**, 피크 −34.5 dBFS — `flip`보다도 7 dB 작다.
- 스케줄러: `setTimeout` 100ms 주기, 0.3초 룩어헤드, `ctx.currentTime` 기준. 0.3초 이상 밀리면(탭 복귀) 몰아 치지 않고 현재 시점으로 맞춘다.
- `stopMusic()`은 약 1초 페이드아웃, 페이드 중 `startMusic()`은 끊김 없이 복귀.
- `Sound.setMusicOn(bool)` — 효과음은 그대로, BGM만. `startMusic()`이 불렸어도 꺼져 있으면 재생하지 않고, 켜면 그때 시작. unlock 전에 `startMusic()`이 불렸으면 unlock 시점에 시작.

## 4. 오디오 시스템

### API
```
Sound.unlock()                     사용자 제스처 안에서 호출(여러 번 안전)
Sound.play(name, opts?)            효과음. opts: tick {last}, flipAll {dur}, flip {back}, match {combo}
Sound.setMuted(bool) / Sound.isMuted()          전체 음소거(저장)
Sound.setMusicOn(bool) / Sound.isMusicOn()      BGM만 켜기/끄기(저장, 기본 false)
Sound.startMusic() / Sound.stopMusic()
```
공통 인터페이스 `{unlock, play, setMuted, isMuted, startMusic, stopMusic}`를 지키고, `setMusicOn`·`isMusicOn`은 추가 메서드다. 알 수 없는 이름, unlock 전 호출, 음소거 중 `play()`는 조용히 무시된다.

### 저장 (localStorage, 읽기·쓰기 모두 try/catch)
- `pair-flip-muted`: `'1'` 음소거 / `'0'` 켬. 기본 켬(소리 남).
- `pair-flip-music`: `'1'` BGM 켬 / `'0'` 끔. **값이 없으면 끔.**
- 저장소가 막힌 환경에서도 기본값으로 동작(검증함).
- 음소거는 마스터 게인을 20ms 시정수로 0으로. 음악 스케줄러는 계속 돌아 해제 시 곡 중간부터 이어진다.

### iPad Safari
- AudioContext는 **첫 사용자 제스처 안에서** `Sound.unlock()`으로 생성·`resume()`하고 1샘플 무음 버퍼를 재생해 iOS 출력 경로를 연다. **시작 버튼(click/touchend)에서 반드시 unlock.**
- 주의: 카드 입력이 `pointerdown`이다. iOS에서 `pointerdown`/`touchstart`만으로는 오디오 잠금이 풀리지 않을 수 있으므로, 카드 핸들러에서도 `Sound.unlock()`을 부르되 **시작 버튼의 click에서 먼저 unlock되는 흐름을 보장**한다(미리보기 전 시작 버튼을 반드시 누르는 구조면 해결). 미리보기 6초 동안은 입력이 없으므로 unlock은 시작 버튼이 유일한 기회다.
- **무음 스위치/무음 모드**가 켜져 있으면 Web Audio 소리가 나지 않을 수 있다(게임 오류 아님). 도움말에 "소리가 안 나면 무음 모드를 확인하세요" 한 줄 권장. 소리 없이도 완전히 플레이 가능.
- 탭 전환/홈 이동: `visibilitychange`에서 `ctx.suspend()`, 복귀 시 `resume()` (모듈이 자동 처리). 게임 타이머 일시정지 여부는 Developer/기획 판단.
- AudioContext 미지원·생성 실패 시 모든 메서드는 무시되고 게임은 정상 진행.

## 5. Developer 호출 지점

| 위치 | 호출 |
|---|---|
| 모든 사용자 입력 핸들러(시작, 버튼, 카드 pointerdown, keydown, 음소거·음악 버튼) 맨 앞 | `Sound.unlock()` |
| 시작 버튼 / 다시하기 (click) | `Sound.play('button'); Sound.startMusic();` (BGM 꺼짐 설정이면 아무 일 없음) |
| 일반 버튼(도움말, 닫기 등) | `Sound.play('button')` |
| 미리보기 남은 3·2초 | `Sound.play('tick')` |
| 미리보기 남은 1초 | `Sound.play('tick', { last: true })` |
| 미리보기 끝 → 전체 뒤집힘 시작(타이머 시작) | `Sound.play('flipAll')` (애니메이션을 0.3초가 아닌 값으로 바꾸면 `{ dur: 초 }`) |
| 카드 한 장 뒤집힘(pointerdown 즉시, 첫 장·둘째 장 모두) | `Sound.play('flip')` |
| └ 둘째 장이 짝 맞음(마지막 짝 제외) | 같은 순간 `Sound.play('match', { combo: 연속맞힘수 })` (틀리면 combo 1로 리셋, 첫 맞힘 = 1) |
| └ 둘째 장이 틀림 | 같은 순간 `Sound.play('miss')` |
| └ 틀린 두 장이 0.8초 뒤 덮일 때 | `Sound.play('flip', { back: true })` **한 번** |
| 마지막 짝(판 클리어) | `Sound.play('clear'); Sound.stopMusic();` (`match` 부르지 않음) |
| 결과 화면 — 새 기록일 때 | clear 뒤 1.0초 이상 지나서 `Sound.play('record')` |
| 음소거 버튼 🔊/🔇 | `Sound.setMuted(!Sound.isMuted())` + 아이콘 갱신(초기 표시는 `Sound.isMuted()`) |
| 음악 버튼 🎵 | `Sound.setMusicOn(!Sound.isMusicOn())` + 아이콘 갱신(초기 표시는 `Sound.isMusicOn()`, 기본 꺼짐) |

- 연타가 아무리 빨라도 `flip`을 매번 그대로 부르면 된다(스로틀·동시 발음 제한·자동 축소는 모듈이 처리).
- 이미 열린 카드·사라진 카드를 눌러 아무 일도 안 일어나면 소리도 내지 않는다.

## 6. 검증 기록

측정 스크립트·WAV: `/tmp/claude-0/-home-user-My-first-studio/9805f6e4-c537-57c6-a6ab-0627bfd2bbd5/scratchpad/pair-flip-sound/` (임시, 세션 정리 시 사라짐).

| 항목 | 방법 | 결과 |
|---|---|---|
| 문법 | `node --check sound-module.js` | 통과 |
| 레벨·클리핑 | Chromium OfflineAudioContext 48kHz 스테레오, 효과음 8개(+옵션 변형) 개별 렌더 | 피크 −13.1 ~ −31.1 dBFS, 클리핑 0 |
| 연타 | `flip` 30ms 간격 20회 / 80ms 20회 / 400ms 6회 | 이벤트별 피크 −32 ~ −27 / −30 ~ −27 / −28 ~ −26 dB. 빨라질수록 오히려 작아짐, 클리핑 0 |
| 실제 플레이 흐름 | 8쌍 0.45초 간격(flip, 0.12초 뒤 flip + match combo 1~7, 마지막 clear) | 피크 −11.8 dB, 클리핑 0 |
| 틀림 흐름 | flip, flip+miss, 0.8초 뒤 flip back ×2 동시, 다시 맞힘 / 0.5초 간격 6연속 틀림 | 피크 −15.6 / −20.0 dB, back 2장 동시는 하나만 남음 |
| 최악 겹침 | BGM + 효과음 8개 동시 | 피크 −9.9 dBFS, 클리핑 0 |
| 배경음악 | 54초 렌더 | RMS −49.4, 피크 −34.5 dBFS; BGM + 실제 플레이 피크 −14.7 |
| 실시간 API | Chromium iPad(gen 7) 에뮬레이션, 터치 탭, localStorage 차단 / 정상 각각: unlock 전 play·startMusic 무시 → 탭 후 전 효과음 + 없는 이름, flip·match·miss 30ms 연타 40회, setMusicOn on, 음소거 토글, stop→start(페이드 중 재시작), stop 완료 후 재시작, setMusicOn off | 페이지 오류 0. 기본값 muted=false, music=false. 저장 키 정상 기록 |

`node tests/smoke.js pair-flip`은 게임 페이지가 아직 없어 실행하지 않았다(모듈 단독 검증). Developer 연결 후 `node tests/smoke.js --lab pair-flip`으로 확인 필요.

**청취 확인 필요(미검증)**: 헤드리스 환경이라 실제 소리는 듣지 못했다. 실기기에서
① `flip` '탁'이 빠른 연타에서 거슬리지 않는지, iPad 스피커에서 너무 작아 안 들리지는 않는지(작으면 노이즈 0.07→0.09, 거슬리면 `FLIP_CAP` 3→2),
② `miss` '뚱'이 기분 나쁘지 않은지, 너무 작아 틀린 줄 모르지는 않는지(iPad 스피커는 250Hz 근처가 약함 — 안 들리면 sine 0.10→0.13),
③ `match` 콤보 상승이 기분 좋게 들리는지, 콤보 8(A6)이 날카롭지 않은지,
④ `flipAll` 0.3초 '촤르륵'이 카드 뒤집힘 애니메이션과 맞는지,
⑤ `clear`→`record` 팡파레가 구별되는지,
⑥ BGM을 켰을 때 크기(`MUSIC_VOL` 0.10)와 집중 방해 여부,
⑦ iPad Safari 첫 터치 후 소리·무음 스위치 동작, `pointerdown`만으로 시작하는 경로가 없는지, ⑧ 탭 전환 후 복귀 시 재개.
