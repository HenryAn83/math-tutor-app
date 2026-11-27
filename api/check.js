// 2단계: 대화 전에 문제를 서로 모르게 두 번 풀고 답을 비교한다.
// 결과(정답 풀이)는 잠근 상태로 폰에 돌려준다. 서버에는 남기지 않는다.
// 여기서 무료 문제 1회를 쓴다(선생님 쪽 오류로 실패하면 돌려준다).
import { askJSON, onlyPost, sendError, seal, MOCK } from "./_lib.js";
import { solveSystem, SOLVE_SCHEMA, COMPARE_SYSTEM, COMPARE_SCHEMA } from "./_prompts.js";
import { langOf, say } from "./_i18n.js";
import { requireUser, useCredit, refundCredit, countUse, creditsOf, noCredits, dailyFull } from "./_auth.js";
import crypto from "node:crypto";

const MAX_PROBLEM = 4000;
const MAX_ANSWER = 300;

export default async function handler(req, res) {
  if (!onlyPost(req, res)) return;
  const problem = String(req.body?.problem || "").trim();
  // 화면에 다시 그린 그림이 있으면 그 안의 이름들(선생님이 ⟦선분 AB⟧로 짚을 수 있게)
  const figure = String(req.body?.figure || "").slice(0, 600);
  // "내 답 확인": 학생이 먼저 낸 답(없으면 보통처럼 대화로 시작)
  const answer = String(req.body?.answer || "").trim().slice(0, MAX_ANSWER);
  if (!problem || problem.length > MAX_PROBLEM) {
    return res.status(400).json({ error: say(req, "badProblem") });
  }
  const user = await requireUser(req, res);
  if (!user) return;
  // 이 문제는 시작할 때의 언어로 끝까지 대화한다(잠긴 상자에 같이 넣는다)
  const lang = langOf(req);
  const ticket = await useCredit(user);
  if (ticket === "credits") return noCredits(res);
  if (ticket === "daily") return dailyFull(res);
  try {
    let check;
    if (MOCK) {
      const s = { solvable: true, issue: "", final_answer: "x = 11", steps: "1. 3x - 6 = 2x + 5\n2. x = 11", key_idea: "이항하면 부호가 바뀐다" };
      check = { agree: !problem.includes("다름"), solutions: [s, { ...s, final_answer: "x = 1" }] };
      check.student = !answer ? "none" : !check.agree ? "unclear" : /(^|[^0-9])(11|10)([^0-9]|$)/.test(answer) ? "correct" : "wrong";
    } else {
      const solveOnce = () =>
        askJSON({
          system: solveSystem(lang),
          schema: SOLVE_SCHEMA,
          effort: "high",
          messages: [{ role: "user", content: problem }],
        });
      const solutions = await Promise.all([solveOnce(), solveOnce()]);
      let agree = false;
      let student = answer ? "unclear" : "none";
      if (solutions.every((s) => s.solvable)) {
        // 두 풀이 비교와 학생 답 비교를 한 번에 해서 기다리는 시간을 늘리지 않는다
        const verdict = await askJSON({
          system: COMPARE_SYSTEM,
          schema: COMPARE_SCHEMA,
          effort: "low",
          maxTokens: 4000,
          messages: [
            {
              role: "user",
              content: `문제: ${problem}\n\n풀이 1 최종 답: ${solutions[0].final_answer}\n풀이 1: ${solutions[0].steps}\n\n풀이 2 최종 답: ${solutions[1].final_answer}\n풀이 2: ${solutions[1].steps}${answer ? `\n\n[학생 답]: ${answer}` : ""}`,
            },
          ],
        });
        agree = verdict.same;
        if (answer) student = agree ? verdict.student : "unclear";
        if (student === "none") student = "unclear";
      }
      check = { agree, solutions, student };
    }
    // 아이 화면에는 "확인됨/확인 필요"만 알려 준다.
    await countUse(user);
    const pid = crypto.randomBytes(8).toString("hex"); // 통계를 한 문제에 한 번만 남기려고
    const verdict = answer ? check.student : "";
    const out = {
      agree: check.agree,
      sealed: seal({ problem, check, figure, user: user.id, pid, lang, answer, verdict }),
      credits: await creditsOf(user),
    };
    if (answer) {
      out.verdict = verdict; // correct / wrong / unclear
      // 맞혔으면 바로 끝낼 수 있게 풀이와 핵심을 같이 준다(틀렸을 때는 주지 않는다)
      if (verdict === "correct") {
        const s = check.solutions[0];
        out.solution = { answer: s.final_answer, steps: s.steps, key: s.key_idea || "" };
      }
    }
    res.json(out);
  } catch (err) {
    await refundCredit(user).catch(() => {});
    sendError(res, err);
  }
}
