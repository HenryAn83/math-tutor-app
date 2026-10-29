# 수학쌤 (AI 1:1 수학 선생님) — 첫 프로토타입

사진으로 문제를 올리면, 답을 바로 알려주지 않고 질문으로 같이 풀어 주는 웹앱(PWA)입니다.

## 흐름

1. **사진 올리기** (또는 직접 입력)
2. **"이렇게 읽었는데 맞아?"** — AI가 읽은 문제를 보여 주고, 틀렸으면 고칠 수 있음
3. **미리 풀어 보기** — 대화 전에 AI가 문제를 서로 모르게 두 번 풀고 답을 비교
   - 같으면 ✅ 확인됨, 다르면 ⚠️ 선생님이 "한 번 더 확인하면서 같이 풀자"고 솔직히 말함
4. **대화** — 한 번에 질문 하나, 틀리면 힌트부터(방향 → 개념 → 식 → 확인), 끝에 "오늘 배운 핵심" 한 줄 + 비슷한 문제

## 구조

```
폰(public/)  →  우리 서버(api/, Vercel)  →  Claude API
```

- `public/` 화면 (HTML/CSS/JS, 빌드 과정 없음)
- `api/read.js` 사진 → 문제 글
- `api/check.js` 두 번 풀어서 비교
- `api/chat.js` 대화
- `api/_prompts.js` **AI 선생님 지침** — 테스트 피드백은 주로 여기를 고칩니다
- `api/_lib.js` 공통 도구 (접근 코드 확인, Claude 호출, 정답 잠금)
- `api/auth.js` 가입·로그인 (아이디, 비밀번호, 이름만), `api/_auth.js` 로그인 표·무료 횟수
- `api/feedback.js` 의견 보내기, `api/admin.js` 관리 화면(사용자, 횟수 주기, 통계, 의견)
- `api/_db.js` 저장소 (Upstash Redis). 연결 정보가 없으면 메모리에만 담음(내 컴퓨터 테스트용)

무료 문제: 가입하면 5개(`FREE_CREDITS`로 변경). "맞아, 시작!"을 누를 때 1개 차감, 선생님 쪽 오류면 돌려줌.
통계: 문제를 마치면 단원·개념·막힌 지점·힌트 횟수만 서버에 남김(사진, 대화 원문은 남기지 않음).

개인정보: 아이디·이름·남은 횟수·의견·막힌 개념 통계만 서버에 저장. 사진과 대화 원문은 서버에 저장하지 않음(풀이 노트는 폰에만).
미리 풀어 둔 정답은 서버만 열 수 있게 잠가서 폰에 들고 있게 합니다.

## Vercel에 올리기

Vercel 대시보드 → 프로젝트 → Settings → Environment Variables 에 넣을 값:

| 이름 | 값 |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com 에서 만든 키 (`sk-ant-...`) |
| `ACCESS_CODE` | 비밀 링크용 아무 긴 문자열 (예: `sun-river-2817-maple`) |

배포 후 공유 링크: `https://<프로젝트>.vercel.app/?k=<ACCESS_CODE>`
한 번 열면 폰이 코드를 기억하므로, 그다음부터는 홈 화면 아이콘으로 열면 됩니다.

계정 기능에 필요한 것:
- Vercel 프로젝트 → **Storage** → **Upstash for Redis**(무료) 만들고 이 프로젝트에 연결 → `KV_REST_API_URL`, `KV_REST_API_TOKEN`이 자동으로 들어감
- `MASTER_ID`, `MASTER_PASSWORD` — 관리자(마스터) 로그인. 이 아이디는 일반 가입에 쓸 수 없음
- `SECRET_SEED` — 로그인 표 서명용 긴 비밀값 (꼭 넣기 권장)

선택: `CLAUDE_MODEL` (기본 `claude-sonnet-5-5`, 더 정확하게 하려면 `claude-opus-5-5`), `SECRET_SEED` (정답 잠금용 별도 비밀값).

**API 키는 절대 코드나 GitHub에 올리지 마세요.** Vercel 환경 변수에만 넣습니다.

## 내 컴퓨터에서 돌려 보기

```bash
npm install
npm run dev:mock     # AI 없이 가짜 답으로 화면만 확인 (http://localhost:3000/?k=test)
ANTHROPIC_API_KEY=sk-ant-... ACCESS_CODE=test npm run dev   # 진짜 AI로
```
