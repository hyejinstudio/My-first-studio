# 뱀 정원 (snake-garden) — 사운드 명세

모든 소리는 Web Audio API로 실시간 합성한다(음원 파일 없음). 코드: `docs/games/snake-garden/sound-module.js` — Developer가 게임 HTML의 `<script>`에 그대로 붙여 넣는다.

톤: 정원 테마에 맞게 부드럽고 짧게. 귀를 찌르는 소리는 피하고, 자주 나는 소리(열매·방향 전환)일수록 작고 짧게 한다.

## 1. 효과음 목록

| 이름 (`Sound.play`) | 언제 | 합성 레시피 | 길이 |
|---|---|---|---|
| `start` | 게임 시작(첫 시작·재시작) | triangle 3음 상승 아르페지오 C5→E5→G5, 80ms 간격, 피크 0.30, 어택 5ms, 지수 감쇠 | ~0.4s |
| `turn` | 방향이 실제로 바뀔 때 | sine 1400→1100Hz 30ms, 피크 **0.04**(거의 안 들리는 틱). 60ms 안의 연속 호출은 무시 | 0.03s |
| `eat` | 일반 열매 먹음 | square 520→1040Hz 상승 스윕 80ms(피크 0.12) + 40ms 뒤 sine 1040Hz 60ms(0.08) — '뽁' | ~0.1s |
| `bonusSpawn` | 보너스 열매 등장 | sine E6 100ms(0.12) → 70ms 뒤 C6 140ms(0.10) + highpass 6kHz 노이즈 180ms(0.04) 반짝임 | ~0.2s |
| `bonusExpire` | 보너스 열매가 먹히지 않고 사라짐 (선택) | sine G5 80ms → D5 120ms, 피크 0.07/0.06 (작게 하강) | ~0.2s |
| `bonusEat` | 보너스 열매 먹음 | triangle 4음 C5-E5-G5-C6, 50ms 간격, 피크 0.25 + 200ms 뒤 sine E6 250ms(0.08) | ~0.45s |
| `highScore` | 최고 점수 갱신 (게임당 1회, 처음 넘어선 순간) | square G4-C5-E5 각 100ms(0.10) → triangle G5+C6 화음 450ms(0.28/0.12) 팡파르 | ~0.75s |
| `gameOver` | 벽/자기 몸 충돌 | lowpass 노이즈(1200→150Hz) 250ms '쿵'(0.25) + sawtooth 330→82Hz 600ms 하강(0.15) + triangle E4→C4 2음 | ~0.9s |
| `pause` / `resume` | 일시정지 / 재개 (선택) | sine A4→E4 하강 / E4→A4 상승, 120ms, 0.12 | 0.12s |

- 모든 엔벨로프: `gain` 0.0001에서 피크까지 지수 어택 → 0.0001까지 지수 감쇠(클릭음 방지).
- 효과음 마스터 볼륨 0.5.
- **방향 전환 판단**: 생략하지 않고 "아주 작게" 유지. 터치 스와이프 조작에서 입력이 인식됐다는 피드백이 유용하기 때문. 단 피크 0.04 + 60ms 스로틀로 연타 시에도 거슬리지 않게 했다. 청취 후 거슬리면 Developer는 `Sound.play('turn')` 호출만 빼면 된다.
- 최고 점수 갱신음은 게임 중 처음 넘어선 순간 1회만. 게임 오버 시 신기록이면 `gameOver` 뒤 약 0.9초 후 `highScore`를 다시 울려도 된다(선택) — 기본은 진행 중 1회.

## 2. 배경음악 (선택적, 낮은 볼륨)

- **판단**: 기본 켜짐이지만 매우 낮은 볼륨(음악 버스 0.07 × 마스터 0.5). 게임 플레이 중에만 재생, 일시정지·게임 오버 시 정지. 별도 음악 토글은 두지 않고 음소거 토글 하나로 효과음+음악을 함께 끈다(UI 단순화).
- **오리지널 루프**: C 메이저 펜타토닉, 100 BPM, 8분음표 그리드, 32스텝(4마디, 약 9.6초) 반복.
  - 멜로디(triangle): `E5 · G5 · A5 G5 E5 · | D5 · E5 · G5 · · · | E5 · D5 · C5 D5 E5 · | G4 · A4 · C5 · · ·` (· = 쉼표)
  - 베이스(sine): 마디마다 C3, A2, D3, G2 한 음을 길게 + 각 마디 3·7번째 스텝에 한 옥타브 위 짧은 음
- 스케줄링: `setTimeout` 100ms 주기, 250ms 룩어헤드로 `ctx.currentTime` 기준 예약(타이밍 흔들림 방지).
- 기존 게임 음악·멜로디를 재현하지 않은 오리지널 패턴이다.

## 3. 오디오 시스템

### 음소거 토글
- `localStorage` 키 `snake-garden-muted` (`'1'` = 음소거, `'0'` = 소리 켬). 모듈 로드 시 읽고 `setMuted()` 때 저장. 읽기/쓰기 모두 `try/catch` — 사생활 보호 모드 등에서 실패해도 기본값(소리 켬)으로 동작.
- 음소거 시 마스터 게인을 20ms 시정수로 0으로 내림(음악 스케줄러는 계속 돌아도 무음). `play()`는 음소거 중 아무것도 만들지 않는다.
- UI: 화면 구석의 🔊/🔇 버튼, 버튼 표시 상태는 `Sound.isMuted()`로 초기화. 버튼 클릭 핸들러에서도 `Sound.unlock()`을 먼저 호출.

### iPad Safari 오디오 잠금 해제
- AudioContext는 **사용자 제스처 핸들러 안에서** 처음 생성/`resume()`해야 한다. `Sound.unlock()`이 이를 처리한다(최초 호출 시 컨텍스트 생성 + `resume()` + 1샘플 무음 버퍼 재생으로 iOS 출력 경로 활성화).
- Developer는 시작 버튼 `click`, 캔버스 `touchend`/`pointerup`, `keydown` 핸들러 맨 앞에서 `Sound.unlock()`을 호출한다(여러 번 호출해도 안전). `touchstart`보다 `touchend`/`click`이 iOS에서 더 확실하다.
- unlock 전의 `play()`/`startMusic()` 호출은 조용히 무시된다.
- **무음 스위치**: iPad 측면 무음 스위치/제어 센터 무음 모드가 켜져 있으면 Web Audio 소리가 나지 않을 수 있다. 게임 오류가 아니다(필요하면 도움말에 "소리가 안 나면 무음 모드를 확인하세요" 한 줄).
- 탭 전환/홈 화면 이동: `visibilitychange`에서 `ctx.suspend()`, 복귀 시 `ctx.resume()` (모듈이 자동 처리). 게임 자체 일시정지는 Developer 몫.
- AudioContext 미지원·생성 실패 시 모든 메서드는 조용히 무시(게임은 소리 없이 정상 진행).

## 4. Developer 호출 지점

| 위치 | 호출 |
|---|---|
| 모든 사용자 입력 핸들러(시작 버튼 click, 터치 touchend/pointerup, keydown, 음소거 버튼) 맨 앞 | `Sound.unlock()` |
| 게임 시작/재시작 | `Sound.play('start'); Sound.startMusic();` |
| 방향 입력이 실제로 방향을 바꿨을 때(같은 방향·반대 방향 무시된 입력엔 호출 안 함) | `Sound.play('turn')` |
| 일반 열매 먹음 | `Sound.play('eat')` |
| 보너스 열매 생성 | `Sound.play('bonusSpawn')` |
| 보너스 열매 먹음 | `Sound.play('bonusEat')` |
| 보너스 열매 시간 초과로 사라짐 (선택) | `Sound.play('bonusExpire')` |
| 점수가 이번 게임에서 처음 최고 점수를 넘음 | `Sound.play('highScore')` |
| 충돌 → 게임 오버 | `Sound.stopMusic(); Sound.play('gameOver');` |
| 일시정지 | `Sound.stopMusic(); Sound.play('pause');` |
| 재개 | `Sound.play('resume'); Sound.startMusic();` |
| 음소거 버튼 | `Sound.unlock(); Sound.setMuted(!Sound.isMuted());` 후 아이콘 갱신 |
| 페이지 로드 시 음소거 아이콘 초기화 | `Sound.isMuted()` |

## 5. 검증 / 청취 확인 필요
- 확인됨: Node에서 문법·API 정의 로드, Chromium(Playwright) 빈 페이지에서 unlock 전후 모든 `play()`·음악 시작/정지·음소거 저장(`'1'`) 시 예외 없음, AudioContext 미지원 환경에서도 예외 없음, localStorage 접근 불가 환경에서도 로드됨.
- **청취 확인 필요**(헤드리스로는 들을 수 없음): 각 효과음 음량 균형(특히 `turn`이 충분히 작은지, `gameOver`가 과하지 않은지), 배경음악 볼륨이 효과음을 가리지 않는지, 루프 이음매가 자연스러운지, 실제 iPad Safari에서 첫 터치 후 소리가 나는지·무음 스위치 동작.
