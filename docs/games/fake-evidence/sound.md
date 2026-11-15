# 증거 조작범 (fake-evidence) — 사운드 명세

모든 소리는 Web Audio API로 실시간 합성한다(음원 파일 없음). 코드: `docs/games/fake-evidence/sound-module.js` — Developer가 `games/fake-evidence/index.html`의 독립 `<script>` 블록에 그대로 붙여 넣는다(`_test` 부분 포함해도 무해).

**톤 원칙**: 글을 읽는 추리 게임이므로 소리는 "종이·도장·연필" 같은 사무실 질감과 부드러운 피아노/벨 위주. 버저·사각파·고음 반짝이 없음. 효과음 버스에 6.5kHz 로우패스, 피아노 음색에 2.5kHz→0.9kHz 로우패스로 귀 피로를 낮춘다. 자주 나는 소리(카드 열기/닫기·버튼)일수록 작고 짧다.

조성: D 마이너(자연단음계) 계열로 효과음·BGM 통일. 모든 멜로디는 오리지널.

## 1. 신호 경로

```
sfxBus → lowpass 6.5kHz ┐
musicBus(0.09) → duck ──┼→ master(0.55, 음소거) → limiter(DynamicsCompressor) → 출력
  피아노 → echo(0.43s 딜레이, 피드백 0.28, LP 2.2kHz) → musicBus
```
- **마스터 리미터**: threshold −6 dBFS, knee 2, ratio 20, attack 2ms, release 150ms.
- **덕킹**: `correct`/`partial`/`wrong`/`result`/`best` 재생 시 음악을 0.45배로 0.8~1.4초 낮췄다가 서서히 복귀.
- 엔벨로프는 모두 0.0001에서 지수 어택/감쇠(클릭음 방지).
- 노이즈 버퍼 0.6초, 고정 시드(렌더 재현 가능), 재생 시작 위치는 무작위(같은 종이 소리 반복감 완화).

## 2. 효과음 목록

피크 레벨은 OfflineAudioContext 48kHz 렌더 측정값(마스터·리미터 통과 후, 음악 없음).

| 이름 (`Sound.play`) | 언제 | 합성 레시피 | 길이 | 피크 |
|---|---|---|---|---|
| `cardOpen` | 증거 카드 열람(확대/뒤집기) | 밴드패스 노이즈 1.4→3.6kHz 스윕 140ms(어택 25ms, 0.20) '스윽' + 100ms 뒤 2.6kHz 노이즈 탭 50ms. 60ms 스로틀 | 0.14s | −23 dB |
| `cardClose` | 카드 닫기 | 밴드패스 노이즈 2.8→1.3kHz 90ms(0.13) + 50ms 뒤 sine 210→150Hz 60ms '톡'. 60ms 스로틀 | 0.1s | −24 dB |
| `select` | 가짜 후보 카드 선택(도장/표시) | sine 170→85Hz 110ms(0.42, 어택 2ms) '툭' + 로우패스 노이즈 900→400Hz 50ms + 3kHz 노이즈 30ms(질감) | 0.1s | −14 dB |
| `reason` | 이유 보기 하나 선택 | triangle 620→560Hz 60ms(0.16) 나무 '똑' + 4.2→3kHz 좁은 노이즈 60ms(연필 긁힘) | 0.07s | −22 dB |
| `submit` | 제출(판정 요청) | 로우패스 노이즈 40ms '탁' + 피아노 D4 → 90ms 뒤 A4 | 0.45s | −11 dB |
| `correct` | 가짜+이유 모두 정답 | 피아노 F4-A4-D5 아르페지오(80ms 간격) + D5에 A5 겹침 + 300ms 뒤 sine D6 벨(0.03) | 0.85s | −10 dB |
| `partial` | 가짜 증거는 맞고 이유는 틀림 | 피아노 A4 → 120ms 뒤 D5+E5(서스, 미해결 느낌) | 0.7s | −12 dB |
| `wrong` | 가짜 증거를 틀림 | triangle C4(살짝 처짐) → 180ms 뒤 A3(살짝 처짐) + sine A2 받침. 낮고 부드러운 하강, 버저 없음 | 0.55s | −14 dB |
| `link` | 해설에서 모순 연결선이 그어질 때(선 1개당 1회) | sine f0→1.5·f0 200ms 상승 글라이드(어택 30ms) + 끝에 1.5·f0 짧은 핑 + 아주 작은 고역 노이즈. `opts.step`(1~6)마다 f0가 온음씩 올라감(A4, B4, C#5…) | 0.3s | −21 dB |
| `next` | 다음 사건으로 넘어감 | 밴드패스 노이즈 1.1→3.2kHz 220ms(큰 종이 넘김) + 낮은 탭 + 피아노 D5 작게 | 0.45s | −20 dB |
| `caseStart` | 사건 소개 화면 등장 | sine D3 + triangle A3 저음 울림(어택 40~50ms) + 피아노 F4 → E4 (수사 시작 모티프) | 1.0s | −15 dB |
| `result` | 한 판(5사건) 최종 결과 화면 | 피아노 D4-F4-A4(140ms 간격) → D5 길게 + sine D3 받침 (종지) | 1.25s | −13 dB |
| `best` | 새 최고 기록 | 피아노 D5-F5-A5-D6(90ms 간격) + A5 벨 + 아주 작은 고역 노이즈 반짝임 | 1.0s | −13 dB |
| `button` | 일반 UI 버튼(시작, 다시하기, 도움말 등) | sine 1150→950Hz 35ms(0.09) 아주 작은 틱. 40ms 스로틀 | 0.035s | −27 dB |

"피아노" = sine 기음 + 2배음(0.22) + 3배음(0.07), 어택 6ms, 120ms에 35%로 감쇠 후 지수 소멸, 로우패스 2.5→0.9kHz.

레벨 의도: 탐색 소리(카드·이유·버튼·연결선) −21~−27 dB < 선택·사건 전환 −14~−20 dB < 판정·결과 −10~−14 dB. 정답음이 가장 크지만 1초 이내, 음 4개로 절제.

## 3. 배경음악

- **판단: 기본 켜짐, 매우 낮게.** 측정 RMS 약 **−42 dBFS**, 피크 −27 dB(효과음 판정음보다 약 15 dB 아래). 리듬·타악기 없음, 32초에 피아노 음 9~12개뿐이라 읽기 집중을 방해하지 않도록 했다. 음소거 토글 하나로 효과음+음악 모두 꺼진다.
- (선택 기능) 음악만 끄기: `Sound.setMusicEnabled(false)` / `Sound.isMusicEnabled()`, localStorage 키 `fake-evidence-music-off`. UI 공간이 있으면 설정에 "배경음악" 토글로 노출 권장, 없으면 무시해도 된다.
- **오리지널 루프** (32초 = 화음 4개 × 8초, 템포 개념 없이 시간 기반):
  - 패드: 각 음 triangle 2개(±5 cent 디튠), 로우패스 500→850→550Hz 천천히 열림/닫힘, 어택 2.5초, 다음 화음과 3초 겹쳐 크로스페이드.
    `Dm(add9): D3 F3 A3 E4` → `Bbmaj7: Bb2 F3 A3 D4` → `G2 D3 F3 A3` → `A7sus4: A2 E3 G3 D4`
  - 피아노(에코 포함): `2.0s E5, 2.8s D5, 6.0s A4 | 11.0s F5, 11.8s E5, 14.0s C5 | 18.0s D5, 19.0s A4, 22.5s Bb4 | 26.0s E5, 26.8s D5, 29.5s A4`. 홀수 번째 루프에서는 일부(3개)를 빼 반복감을 줄임.
- 스케줄러: `setTimeout` 200ms 주기, 0.6초 룩어헤드, `ctx.currentTime` 기준 예약.
- `stopMusic()`은 약 1.2초 페이드아웃 후 예약된 음을 정리. 페이드 중 `startMusic()`을 부르면 끊김 없이 다시 올라온다.
- 재생 구간 권장: 첫 사건 시작부터 최종 결과 화면까지 계속(사건 사이에 끊지 않음). 결과 화면에서 `stopMusic()`, 다시하기에서 `startMusic()`.

## 4. 오디오 시스템

### API
```
Sound.unlock()                 사용자 제스처 안에서 호출(여러 번 안전)
Sound.play(name, opts?)        효과음. link만 opts { step: n }
Sound.setMuted(bool) / Sound.isMuted()
Sound.startMusic() / Sound.stopMusic()
Sound.setMusicEnabled(bool) / Sound.isMusicEnabled()   (선택)
```
알 수 없는 이름, unlock 전 호출, 음소거 중 `play()`는 조용히 무시된다.

### 음소거
- localStorage 키 `fake-evidence-muted` (`'1'` 음소거 / `'0'` 켬). 로드 시 읽고 `setMuted()` 때 저장. 읽기·쓰기 모두 try/catch — 저장소가 막힌 환경에서도 기본값(소리 켬)으로 동작(헤드리스에서 저장소 차단 상태로 확인함).
- 음소거 시 마스터 게인을 20ms 시정수로 0으로. 음악 스케줄러는 계속 돌아 해제 시 곡 중간부터 자연스럽게 이어짐.
- UI: 🔊/🔇 버튼, 초기 표시는 `Sound.isMuted()`로. 버튼 핸들러에서도 `Sound.unlock()` 먼저.

### iPad Safari
- AudioContext는 **첫 사용자 제스처(click/touchend/pointerup/keydown) 안에서** `Sound.unlock()`으로 생성·`resume()`하고 1샘플 무음 버퍼를 재생해 iOS 출력 경로를 연다. `touchstart`보다 `touchend`/`click`이 확실하다.
- **무음 스위치/무음 모드**가 켜져 있으면 Web Audio 소리가 나지 않을 수 있다(게임 오류 아님). 도움말에 "소리가 안 나면 무음 모드를 확인하세요" 한 줄 권장.
- 탭 전환/홈 이동: `visibilitychange`에서 `ctx.suspend()`, 복귀 시 `resume()` (모듈이 자동 처리).
- AudioContext 미지원·생성 실패 시 모든 메서드는 무시되고 게임은 정상 진행.

## 5. Developer 호출 지점

| 위치 | 호출 |
|---|---|
| 모든 사용자 입력 핸들러(시작 버튼, 카드 탭, 보기 탭, keydown, 음소거 버튼) 맨 앞 | `Sound.unlock()` |
| 시작 / 다시하기 / 도움말 등 일반 버튼 | `Sound.play('button')` (아래 전용 소리가 있는 버튼은 그것만) |
| 게임 시작(첫 사건 진입 직전) | `Sound.startMusic()` |
| 사건 소개 화면 표시 | `Sound.play('caseStart')` |
| 증거 카드 열람(확대) | `Sound.play('cardOpen')` |
| 증거 카드 닫기 | `Sound.play('cardClose')` |
| 가짜 후보로 카드 선택(선택 변경 포함) | `Sound.play('select')` |
| 이유 객관식 보기 선택 | `Sound.play('reason')` |
| 제출 버튼 | `Sound.play('submit')` → 판정 표시 시점(약 0.3~0.5초 뒤)에 아래 셋 중 하나 |
| 판정: 증거+이유 정답 | `Sound.play('correct')` |
| 판정: 증거만 정답 | `Sound.play('partial')` |
| 판정: 증거 오답 | `Sound.play('wrong')` |
| 해설에서 모순 연결선 애니메이션 시작(선마다) | `Sound.play('link', { step: i + 1 })` (선 사이 간격 0.15초 이상 권장) |
| 다음 사건 버튼 | `Sound.play('next')` (그 뒤 사건 소개 화면에서 `caseStart`는 0.4초 이상 띄우거나 생략 가능) |
| 최종 결과 화면 | `Sound.play('result'); Sound.stopMusic();` |
| 새 최고 기록일 때 | `result` 약 1.0초 뒤 `Sound.play('best')` |
| 음소거 버튼 | `Sound.setMuted(!Sound.isMuted())` + 아이콘 갱신 |

## 6. 검증 기록

| 항목 | 방법 | 결과 |
|---|---|---|
| 문법 | `node --check sound-module.js` | 통과 |
| 레벨·클리핑 | Chromium OfflineAudioContext 48kHz 스테레오, 효과음 14개 개별 렌더 | 피크 −10.4 ~ −26.9 dBFS, 클리핑 0 |
| 배경음악 | 66초(2루프) 렌더 | RMS −42.1 dBFS, 피크 −26.7 dBFS, 두 루프 레벨 동일, 클리핑 0 |
| 최악 겹침 | 음악 + correct·best·result·select·link·caseStart·submit 동시 | 피크 −3.4 dBFS(리미터 동작), 클리핑 0 |
| 실시간 API | Chromium: unlock 전 play/startMusic 무시, 클릭 후 전 효과음·없는 이름·음소거·음악 토글·stop→start(페이드 중 재시작)·stop | 페이지 오류 0. localStorage 차단 환경에서도 예외 없음 |

**청취 확인 필요(미검증)**: 헤드리스 환경이라 실제 소리는 듣지 못했다. 실기기에서 ① 종이 넘김(`cardOpen`/`next`)이 종이처럼 들리는지, ② `correct`가 과하지 않은지와 `partial`/`wrong`과 구분되는지, ③ BGM이 읽기를 방해하지 않을 만큼 작은지(너무 작거나 크면 `MUSIC_VOL` 0.09 조정), ④ iPad Safari 첫 터치 후 소리·무음 스위치 동작, ⑤ 탭 전환 후 복귀 시 재개를 확인해야 한다.
