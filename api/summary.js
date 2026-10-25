// 4단계: 다 푼 대화를 "풀이 과정 핵심"만 짧게 정리한다. 폰은 이 정리만 기록으로 남기고 대화는 지운다.
// 서버에는 아무것도 남기지 않는다.
import { askJSON, checkAccess, onlyPost, sendError, unseal, MOCK } from "./_lib.js";

const MAX_TURNS = 120;
const MAX_MESSAGE = 2000;

const SUMMARY_SYSTEM = `너는 중학생이 AI 선생님과 수학 문제를 푼 대화를 보고, 학생이 나중에 복습할 "풀이 노트"를 만든다.
대화를 옮겨 적지 말고, 풀이 과정을 핵심 위주로 아주 짧게 정리한다.

- title: 문제 종류를 알 수 있는 짧은 이름(15자 안팎). 예: "괄호 있는 일차방정식", "삼각형 내각의 합"
- steps: 풀이 단계 2~5개. 한 줄에 한 단계, 각 30자 안팎. 식이 있으면 식 위주로. 예: "3(x - 2) = 2x + 5 → 괄호 풀기: 3x - 6 = 2x + 5"
- key: 이 문제의 핵심 개념 한 줄
- stuck: 학생이 막혔거나 틀렸던 지점을 한 줄로(다음에 조심할 점). 없으면 빈 문자열.
- answer: 최종 답. 끝까지 못 풀었으면 빈 문자열.
- finished: 학생이 이 문제를 끝까지 풀었으면 true

[정답 참고]에 정답 풀이가 있으면 계산이 틀리지 않게 참고하되, 실제 대화에서 학생이 간 길을 따라 정리한다.
학생 이름이나 개인 정보는 적지 않는다. 학생에게 말하듯 편한 반말로 쓴다.

수식 표기: LaTeX나 $ 기호를 쓰지 않는다. 예: x², √2, 3/4, ×, ÷, ≤, ≥, π, ∠ABC, △ABC`;

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    steps: { type: "array", items: { type: "string" } },
    key: { type: "string" },
    stuck: { type: "string" },
    answer: { type: "string" },
    finished: { type: "boolean" },
  },
  required: ["title", "steps", "key", "stuck", "answer", "finished"],
  additionalProperties: false,
};

export default async function handler(req, res) {
  if (!onlyPost(req, res) || !checkAccess(req, res)) return;
  const { sealed, messages } = req.body || {};
  let session;
  try {
    session = unseal(sealed);
  } catch {
    return res.status(400).json({ error: "이 기록은 정리할 수 없어." });
  }
  if (!Array.isArray(messages) || messages.length > MAX_TURNS) {
    return res.status(400).json({ error: "이 기록은 정리할 수 없어." });
  }
  const talk = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => `${m.role === "user" ? "학생" : "선생님"}: ${m.content.slice(0, MAX_MESSAGE)}`)
    .join("\n");
  const s = session.check.solutions?.[0];
  const reference = session.check.agree && s ? `최종 답: ${s.final_answer}\n풀이: ${s.steps}` : "(확실한 정답 없음)";
  if (MOCK) {
    return res.json({
      title: "괄호 있는 일차방정식",
      steps: ["괄호 풀기: 3x - 6 = 2x + 5", "x는 왼쪽, 숫자는 오른쪽: 3x - 2x = 5 + 6", "x = 11"],
      key: "이항하면 부호가 바뀐다",
      stuck: "괄호 앞 숫자를 뒤 항에도 곱하는 걸 놓쳤어",
      answer: "x = 11",
      finished: true,
    });
  }
  try {
    const summary = await askJSON({
      system: SUMMARY_SYSTEM,
      schema: SUMMARY_SCHEMA,
      effort: "low",
      maxTokens: 4000,
      messages: [{ role: "user", content: `[문제]\n${session.problem}\n\n[정답 참고]\n${reference}\n\n[대화]\n${talk}` }],
    });
    res.json(summary);
  } catch (err) {
    sendError(res, err);
  }
}
