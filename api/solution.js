// "📖 풀이 보기": 여러 번 막힌 학생에게 미리 풀어 둔 풀이를 보여 준다.
// 이미 잠가 둔 풀이를 여는 것뿐이라 Claude를 다시 부르지 않는다(비용 0, 바로 나온다).
import { onlyPost, unseal } from "./_lib.js";
import { requireUser } from "./_auth.js";
import { say } from "./_i18n.js";

export default async function handler(req, res) {
  if (!onlyPost(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;
  let session;
  try {
    session = unseal(req.body?.sealed);
    if (session.user !== user.id) throw new Error("other user");
  } catch {
    return res.status(400).json({ error: say(req, "restart") });
  }
  const { agree, solutions = [] } = session.check || {};
  const pick = (s) => ({ answer: s?.final_answer || "", steps: s?.steps || s?.issue || "", key: s?.key_idea || "" });
  // 두 번 푼 답이 달랐으면 둘 다 보여 주고 "확인 필요"라고 솔직히 말한다
  res.json({
    agree: Boolean(agree),
    solutions: agree ? [pick(solutions[0])] : solutions.filter((s) => s).map(pick),
  });
}
