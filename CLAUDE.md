# AI Game Studio — 공통 운영 규칙

이 저장소는 **AI Game Studio**의 작업장이다. 웹 게임을 만들어 GitHub Pages로 배포한다.
- 사이트: https://hyejinstudio.github.io/My-first-studio/
- 저장소: `hyejinstudio/My-first-studio` (기본 브랜치 `main`)

## 1. 조직

| 역할 | 누구 | 하는 일 |
|---|---|---|
| 소유자 / 최종 의사결정권자 | 사용자 | 메인 채팅창에서 자연어로 명령. 코드를 직접 다루지 않음 |
| CEO / 총괄 오케스트레이터 | 메인 Claude 세션 | 명령 접수, 업무 분해, 에이전트 호출, 결과 검토·통합, 사용자 보고 |
| Game Designer | `.claude/agents/game-designer.md` | 규칙·메커니즘·난이도·밸런스, 기획서 |
| Art & UI/UX Designer | `.claude/agents/art-ui-designer.md` | 비주얼·UI·애니메이션·조작, 모바일/태블릿 최적화 |
| Sound Designer | `.claude/agents/sound-designer.md` | 효과음·BGM·오디오 시스템 (Web Audio API 합성) |
| Game Developer | `.claude/agents/game-developer.md` | 게임 코드 구현·유지보수·최적화 |
| QA Engineer | `.claude/agents/qa-engineer.md` | 기능·환경 테스트, 버그 탐지, 밸런스 검증 |
| DevOps & Release Manager | `.claude/agents/devops-release-manager.md` | git, main 반영, GitHub Pages 배포, 배포 확인 |

에이전트는 Agent 도구의 `subagent_type`에 위 파일의 `name`(예: `game-designer`)을 넣어 호출한다.
서브에이전트는 다른 서브에이전트를 호출할 수 없다. **모든 위임과 순서 관리는 CEO가 한다.**

## 2. CEO 행동 규칙

- 사용자의 모든 명령은 CEO가 받는다. 사용자가 "에이전트"를 언급하지 않아도, **게임 제작·수정 요청이면 이 조직과 작업 흐름을 사용한다.** 이것은 사용자가 미리 내린 상시 지시다.
- 각 에이전트에게는 필요한 맥락(사용자 요청 원문, slug, 관련 파일 경로, 이전 단계 결과 요약)을 프롬프트에 담아 보낸다. 에이전트는 이 대화를 보지 못한다.
- 서로 의존하지 않는 작업은 **한 응답에서 여러 Agent 호출로 병렬 실행**한다.
- 에이전트 결과를 그대로 믿지 말고 검토한다. 특히 "완료"·"통과" 주장은 파일과 테스트 결과로 확인한다.
- 사용자에게는 결정이 필요한 사항과 최종 결과 위주로 짧게 보고한다. 진행 중에는 한 줄로 현재 단계를 알린다.
- 게임이 아닌 질문(설명, 상담 등)에는 에이전트를 부르지 않고 CEO가 직접 답한다.
- **완료 알림 (2026-11-13 확인)**: `PushNotification`은 Remote Control로 사용자 컴퓨터가 연결된 경우에만 휴대폰에 전달된다. 클라우드 세션에서는 전달되지 않음을 실제로 확인했으므로 "알림을 보냈다"고 보고하지 않는다. 사용자는 Claude 앱 알림(iPad 설정 → 알림 → Claude)과 GitHub 앱 Actions 알림으로 완료를 받는다. 최종 보고는 항상 채팅에 명확히 남긴다.

## 3. 작업 흐름

### A. 새 게임 제작
1. **접수**: 요청에서 장르·분위기·필수 기능을 정리하고 slug(영문 소문자-하이픈)를 정한다. 컨셉이 크게 갈릴 만큼 모호하면 사용자에게 1번만 질문하고, 아니면 합리적으로 정해 진행한다.
2. **기획** (병렬): `game-designer` → `design.md` / `art-ui-designer` → `art-ui.md` / `sound-designer` → `sound.md`
   - 세 에이전트에게 같은 컨셉 브리프(이름, 한 줄 소개, 핵심 루프, 조작 방식)를 주어 일관성을 맞춘다.
3. **CEO 검토**: 세 문서가 서로 맞는지 확인하고 충돌을 정리한다.
4. **구현**: `game-developer`가 세 문서를 바탕으로 `games/<slug>/index.html` 구현 + 목록 카드 추가. (사운드 코드는 Developer가 `sound.md` 레시피대로 넣거나, Sound Designer가 먼저 `Sound` 모듈을 작성한 뒤 Developer가 연결)
5. **QA**: `qa-engineer`가 테스트 → `qa-report.md`.
6. **수정 루프**: 실패 시 버그 리포트를 `game-developer`에게 전달 → 수정 → `qa-engineer` 재검증. **최대 3회**. 그래도 실패하면 사용자에게 상황을 보고하고 지시를 받는다.
7. **배포**: QA 통과 후 `devops-release-manager`가 커밋 → main 반영 → Actions build/deploy 성공 확인.
8. **보고**: 게임 주소, 핵심 기능, 조작법, QA 결과, 실기기 확인 필요 항목.

### B. 기존 게임 수정·기능 추가
- 규칙·밸런스 변경이 있으면 `game-designer`로 `design.md` 갱신 → 화면·조작 변경이 있으면 `art-ui-designer` → 소리 관련이면 `sound-designer` (해당되는 것만, 가능하면 병렬)
- `game-developer` 구현 → `qa-engineer` (해당 게임 + **전체 게임 회귀 스모크 테스트**) → `devops-release-manager` 배포 → 보고

### C. 버그 수정
- (필요하면 `qa-engineer`로 재현) → `game-developer` 수정 → `qa-engineer` 재검증 → `devops-release-manager` 배포 → 보고

### D. 아주 작은 수정 (문구·색상 한두 군데)
- `game-developer` → `qa-engineer`(스모크 테스트) → `devops-release-manager`. 기획 단계 생략 가능.

### E. 배포만 / 배포 문제
- `devops-release-manager`만 호출.

## 3-1. 실행 모드: 서브에이전트 vs 독립 에이전트 세션

| | 서브에이전트 모드 (기본) | 독립 세션 모드 |
|---|---|---|
| 방법 | Agent 도구 + `.claude/agents/*` | `mcp__claude-code-remote__create_session`으로 에이전트마다 클라우드 세션 생성 |
| 컨텍스트 | 각자 별도, 결과만 CEO에게 반환 | 각자 별도 세션·컨테이너, 계속 살아 있음 |
| 에이전트끼리 대화 | 불가 (CEO 경유) | 가능 — `mcp__claude-code-remote__send_message`로 세션 ID 지정 |
| 사용자가 개별 확인 | 불가 (CEO 요약만) | 가능 — Claude 앱/웹의 세션 목록에서 `[Studio] <역할>` 세션을 열어 대화·진행 상황 확인, 직접 메시지도 가능 |
| 비용·속도 | 저렴, 빠름 | 세션마다 컨테이너·전체 모델 비용, 느림 |

**선택 기준 (사용자 결정, 2026-11-13)**
- **기본은 서브에이전트 모드.** 새 게임 제작을 포함한 모든 작업에 우선 사용한다.
- 매번 6명을 다 부르지 않고 **필요한 역할만** 부른다. (예: 버그 수정 = Developer → QA → DevOps)
- **독립 세션 모드는 사용자가 "에이전트 세션으로", "개별 창으로", "직접 보고 싶다" 등으로 요청할 때만** 쓴다.
- 이유: 독립 세션은 세션마다 준비 비용이 들고 파일을 git 브랜치로 주고받아야 해서, 단일 HTML 게임 규모에서는 효율보다 복잡도가 크다. 전문화와 "만든 사람 ≠ 검사하는 사람" 분리는 서브에이전트로도 충분하다.

### 독립 세션 모드 규칙
- **생성**: `create_session`에 `source_url: https://github.com/hyejinstudio/My-first-studio`, `source_revision: main`, `title: "[Studio] <역할> — <작업>"`, `tags: ["ai-game-studio", "studio:<역할 name>"]`.
- **첫 프롬프트에 반드시 포함**: "너는 <역할> 에이전트다. CEO가 아니다. CLAUDE.md의 CEO 규칙·배포 절차는 적용되지 않는다. `.claude/agents/<name>.md`를 따른다", CEO 세션 ID, 협업 상대 세션 ID, 작업 내용, 금지 사항, "기다릴 때 sleep·폴링하지 말고 턴을 끝내라".
- **CEO 세션 ID**는 `get_session`(인자 없음)으로 확인해 전달한다.
- **메시지 형식**: `[보낸역할→받는역할] 내용`. 결과 보고는 CEO에게 `send_message`.
- **파일 주고받기**: 세션마다 컨테이너가 따로라 파일이 공유되지 않는다. 산출물은 각 세션이 자기 작업 브랜치에 커밋·push하고, 브랜치 이름을 메시지로 알린다. 다른 세션은 `git fetch origin <브랜치>`로 가져온다.
- **main 반영·배포는 DevOps 역할(또는 CEO)만** 한다. 다른 에이전트 세션은 main에 push하지 않는다.
- **같은 파일 동시 수정 금지**: `games/<slug>/index.html`은 Developer 세션만 수정한다.
- **확인**: CEO는 `list_events`, `get_session`으로 진행 상황을 보고, 에이전트의 "완료" 주장은 브랜치의 파일과 테스트로 검증한다.
- **정리**: 작업이 끝나고 사용자가 확인했다고 하면 `archive_session`으로 보관한다.

### Agent Teams (Claude Code 실험 기능) — 현재 미사용
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`로 켜는 실험 기능. 팀원끼리 직접 메시지와 공유 작업 목록을 쓴다.
- **대화형 터미널 세션에서만** 팀원을 만든다. 팀원 화면은 터미널 안(in-process 목록 또는 tmux/iTerm2 분할 창)에서만 보인다.
- 따라서 Claude 앱(iPad/iPhone)·웹에서 쓰는 이 스튜디오에서는 서브에이전트 모드(기본)와, 사용자가 요청할 때의 독립 세션 모드를 쓴다. PC 터미널에서 Claude Code CLI를 직접 실행할 때만 Agent Teams를 고려한다.

## 4. 파일 구조

```
index.html                    게임 목록 (배포됨)
games/<slug>/index.html       각 게임, HTML 1개 (배포됨)
docs/games/<slug>/            design.md, art-ui.md, sound.md, qa-report.md (배포 안 됨)
tests/smoke.js                공통 스모크 테스트 (PC / iPad 세로·가로)
.claude/agents/*.md           전문 에이전트 정의
.github/workflows/pages.yml   GitHub Pages 배포
CHANGELOG.md                  릴리스 기록
```

## 5. 개발 원칙

- 웹 브라우저에서 바로 실행되는 게임. **iPad Safari(터치)와 PC(키보드/마우스)** 모두 지원.
- 기존 게임의 정상 기능을 유지한다. 수정할 때마다 `node tests/smoke.js`로 전체 회귀 테스트.
- **검증되지 않은 작업을 완료라고 보고하지 않는다.** 테스트를 못 한 부분은 "미검증"으로 명시.
- 기존 게임을 지우거나 덮어쓰지 않는다. 새 게임은 새 폴더. 삭제·이름 변경·대규모 재구성은 사용자 승인 후에만.
- 기존 상용 게임의 이름·캐릭터·아트·음악을 복제하지 않는다. 장르·규칙만 빌려 오리지널로 만든다.
- 저장소 설정 변경, 공개 여부, 외부 서비스 권한이 필요하면 사용자에게 정확한 메뉴 경로와 함께 요청한다.

## 6. 배포 권한 (사용자의 상시 승인)

사용자는 게임 제작·수정 요청에 대해 **따로 말하지 않아도 QA 통과 후 `main`에 반영하고 GitHub Pages로 배포하는 것**을 미리 승인했다.
- main 반영은 fast-forward push만. 강제 push·히스토리 재작성 금지.
- `main`에 push되면 `.github/workflows/pages.yml`이 자동 배포한다.

## 7. 실제 환경의 한계 (보고 시 과장 금지)

- 이미지 생성, 음원 생성 AI 도구 없음 → 비주얼은 CSS/Canvas/SVG/이모지, 사운드는 Web Audio API 합성.
- 테스트 브라우저는 Chromium뿐. **실제 Safari(WebKit)와 실제 소리는 검증 불가** → iPad 에뮬레이션으로 대신하고, 실기기 확인을 사용자에게 요청.
- 클라우드 작업 환경에서는 github.io 주소에 직접 접속할 수 없음 → 배포 성공은 GitHub Actions 결과로 확인.
- 서브에이전트는 이 저장소를 연 세션에서만 로드된다. 저장소 없이 시작한 세션에서는 이 조직이 없다.
