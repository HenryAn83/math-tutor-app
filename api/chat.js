// 3단계: 소크라테스식 대화. 대화 기록은 폰에만 있고 매번 같이 보내온다.
import { askText, checkAccess, onlyPost, sendError, unseal, MOCK } from "./_lib.js";
import { tutorSystem } from "./_prompts.js";
import { requireUser } from "./_auth.js";

const MAX_TURNS = 60;
const MAX_MESSAGE = 2000;

export default async function handler(req, res) {
  if (!onlyPost(req, res) || !checkAccess(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const { sealed, messages } = req.body || {};
  let session;
  try {
    session = unseal(sealed);
    if (session.user !== user.id) throw new Error("other user");
  } catch {
    return res.status(400).json({ error: "문제를 처음부터 다시 올려 줄래?" });
  }
  if (!Array.isArray(messages) || messages.length > MAX_TURNS) {
    return res.status(400).json({ error: "대화가 너무 길어졌어. 새 문제로 시작해 볼까?" });
  }
  const clean = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE) }));
  // 첫 질문은 선생님이 먼저 꺼낸다.
  const convo = [{ role: "user", content: "(학생이 문제 확인을 마쳤어요. 첫 질문을 해 주세요.)" }, ...clean];
  if (convo.at(-1).role !== "user") {
    return res.status(400).json({ error: "메시지를 다시 보내 줄래?" });
  }
  if (MOCK) {
    const first = clean.length === 0;
    return res.json({
      reply: first
        ? (session.check.agree ? "" : "이 문제는 선생님도 한 번 더 꼼꼼히 확인하면서 같이 풀어 볼게. ") +
          "좋아, 시작해 보자! 먼저 왼쪽 3(x - 2)의 괄호를 풀면 어떻게 될까?"
        : "오, 좋아! 왜 그렇게 생각했는지 한 줄로 말해 줄래?",
    });
  }
  try {
    const reply = await askText({
      system: tutorSystem(session),
      messages: convo,
      effort: "medium",
    });
    res.json({ reply });
  } catch (err) {
    sendError(res, err);
  }
}
