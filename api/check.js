// 2단계: 대화 전에 문제를 서로 모르게 두 번 풀고 답을 비교한다.
// 결과(정답 풀이)는 잠근 상태로 폰에 돌려준다. 서버에는 남기지 않는다.
import { askJSON, checkAccess, onlyPost, sendError, seal, MOCK } from "./_lib.js";
import { SOLVE_SYSTEM, SOLVE_SCHEMA, COMPARE_SYSTEM, COMPARE_SCHEMA } from "./_prompts.js";

const MAX_PROBLEM = 4000;

export default async function handler(req, res) {
  if (!onlyPost(req, res) || !checkAccess(req, res)) return;
  const problem = String(req.body?.problem || "").trim();
  if (!problem || problem.length > MAX_PROBLEM) {
    return res.status(400).json({ error: "문제 내용을 다시 확인해 줄래?" });
  }
  try {
    let check;
    if (MOCK) {
      const s = { solvable: true, issue: "", final_answer: "x = 11", steps: "1. 3x - 6 = 2x + 5\n2. x = 11" };
      check = { agree: !problem.includes("다름"), solutions: [s, { ...s, final_answer: "x = 1" }] };
    } else {
      const solveOnce = () =>
        askJSON({
          system: SOLVE_SYSTEM,
          schema: SOLVE_SCHEMA,
          effort: "high",
          messages: [{ role: "user", content: problem }],
        });
      const solutions = await Promise.all([solveOnce(), solveOnce()]);
      let agree = false;
      if (solutions.every((s) => s.solvable)) {
        const verdict = await askJSON({
          system: COMPARE_SYSTEM,
          schema: COMPARE_SCHEMA,
          effort: "low",
          maxTokens: 4000,
          messages: [
            {
              role: "user",
              content: `문제: ${problem}\n\n풀이 1 최종 답: ${solutions[0].final_answer}\n풀이 1: ${solutions[0].steps}\n\n풀이 2 최종 답: ${solutions[1].final_answer}\n풀이 2: ${solutions[1].steps}`,
            },
          ],
        });
        agree = verdict.same;
      }
      check = { agree, solutions };
    }
    // 아이 화면에는 "확인됨/확인 필요"만 알려 준다.
    res.json({ agree: check.agree, sealed: seal({ problem, check }) });
  } catch (err) {
    sendError(res, err);
  }
}
