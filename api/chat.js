// 3단계: 소크라테스식 대화. 대화 기록은 폰에만 있고 매번 같이 보내온다.
import { askText, checkAccess, onlyPost, sendError, unseal, MOCK } from "./_lib.js";
import { tutorSystem } from "./_prompts.js";
import { requireUser } from "./_auth.js";
import { say } from "./_i18n.js";

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
    return res.status(400).json({ error: say(req, "restart") });
  }
  if (!Array.isArray(messages) || messages.length > MAX_TURNS) {
    return res.status(400).json({ error: say(req, "tooLong") });
  }
  const clean = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE) }));
  // 첫 질문은 선생님이 먼저 꺼낸다.
  const start = session.lang === "en" ? "(The student confirmed the problem. Please ask your first question.)" : "(학생이 문제 확인을 마쳤어요. 첫 질문을 해 주세요.)";
  const convo = [{ role: "user", content: start }, ...clean];
  if (convo.at(-1).role !== "user") {
    return res.status(400).json({ error: say(req, "resend") });
  }
  if (MOCK) {
    const first = clean.length === 0;
    session.figure ||= "";
    if (session.lang === "en") return res.json({ reply: first ? MOCK_EN.first : MOCK_EN.next });
    return res.json({
      reply: first
        ? (session.check.agree ? "" : "이 문제는 선생님도 한 번 더 꼼꼼히 확인하면서 같이 풀어 볼게. ") +
          (session.figure.includes("y=2x-1")
            ? "좋아, 시작해 보자! ⟦y=2x-1⟧이 ⟦y축⟧과 만나는 점을 찾으면 돼. x에 뭘 넣으면 될까?"
            : session.figure
              ? "좋아, 시작해 보자! ⟦∠B⟧가 직각이네. 그럼 ⟦변 AC⟧는 어떤 변일까?"
              : "좋아, 시작해 보자! 먼저 왼쪽 3(x - 2)의 괄호를 풀면 어떻게 될까?")
        : "오, 좋아!\n[핵심설명] 직각삼각형에서는 빗변의 제곱이 나머지 두 변의 제곱의 합과 같아. 이걸 피타고라스 정리라고 해.\n\n그럼 AC² = 6² + 8² 을 계산해 볼래?",
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

const MOCK_EN = {
  first: "Let's get started! ⟦∠B⟧ is a right angle. So what kind of side is ⟦side AC⟧?",
  next: "Nice!\n[Key idea] In a right triangle, the hypotenuse squared equals the sum of the squares of the other two sides. That's the Pythagorean theorem.\n\nSo can you work out AC² = 6² + 8²?",
};
