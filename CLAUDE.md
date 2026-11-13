# 나의 게임 스튜디오 — Claude 작업 규칙

이 저장소는 GitHub Pages로 배포되는 게임 모음 사이트입니다.
- 사이트 주소: https://hyejinstudio.github.io/My-first-studio/
- `main` 브랜치에 push 되면 `.github/workflows/pages.yml`이 자동으로 같은 주소에 배포합니다.

## 저장소 주인의 상시 요청 (배포 권한)
저장소 주인은 게임을 만들거나 고쳐 달라는 요청에 대해, 따로 말하지 않아도
**항상 `main` 브랜치에 반영하고 배포까지 완료해 달라**고 미리 허락했습니다.
게임 관련 작업을 할 때는 매번 아래 절차를 끝까지 진행하세요.

1. 작업 브랜치에서 변경하고 커밋합니다.
2. 같은 커밋을 `main`에도 push 합니다 (`git push origin HEAD:main`, fast-forward만; 강제 push 금지).
   fast-forward가 안 되면 `origin/main`을 먼저 가져와 리베이스한 뒤 push 합니다.
3. GitHub Actions의 `Deploy to GitHub Pages` 실행이 `build`, `deploy` 모두 성공했는지 확인합니다.
4. 사용자에게 게임 주소를 알려줍니다.

게임과 관련 없는 작업(질문 답변, 설명 등)에는 이 절차를 적용하지 않습니다.

## 사이트 구조
- `index.html` — 첫 화면(게임 목록). 게임마다 카드 하나.
- `games/<게임-이름>/index.html` — 각 게임. 하나의 HTML 파일에 CSS/JS를 모두 넣습니다.
  - 게임 주소: `https://hyejinstudio.github.io/My-first-studio/games/<게임-이름>/`
- 배포 워크플로는 `index.html`과 `games/` 폴더만 사이트로 올립니다.

## 새 게임을 만들 때
- 기존 게임을 지우거나 덮어쓰지 말고 `games/` 아래에 새 폴더(영문 소문자, 하이픈)로 추가합니다.
- `index.html` 게임 목록 맨 위에 카드(아이콘, 이름, 한 줄 설명)를 추가합니다.
- 게임 페이지 위쪽에 `← 게임 목록`(`href="../../"`) 링크를 넣습니다.
- 사용자가 아이패드 Safari에서 플레이하므로 터치 조작을 꼭 지원합니다 (키보드 조작도 함께).
- 기존 게임 이름·캐릭터·디자인을 그대로 베끼지 말고, 장르와 규칙만 빌려 오리지널 이름과 디자인으로 만듭니다.
- push 전에 Playwright로 페이지를 열어 콘솔 오류가 없는지 확인합니다.

## 기존 게임을 고칠 때
- 해당 `games/<게임-이름>/index.html`만 수정하고, 위와 같은 절차로 `main`에 반영·배포합니다.
