// 2단계: 대화 전에 문제를 서로 모르게 두 번 풀고 답을 비교한다.
// 결과(정답 풀이)는 잠근 상태로 폰에 돌려준다. 서버에는 남기지 않는다.
// 여기서 무료 문제 1회를 쓴다(선생님 쪽 오류로 실패하면 돌려준다).
//
// 빨리 시작하려고 "이렇게 읽었는데 맞아?" 화면이 뜨자마자 미리 풀기도 한다(presolve).
// 미리 풀기는 차감하지 않고 "아직 못 쓰는 상자"를 준다. 학생이 "맞아"를 누르면 claim으로 그 상자를 쓰고 그때 1회 차감한다.
// 학생이 문제를 고치거나 그냥 나가면 미리 푼 비용은 버려진다(헨리 승인 2026-11-27). 그래서 하루 횟수와 이번 달 비용으로 제한한다.
import { askJSON, onlyPost, sendError, seal, unseal, MOCK } from "./_lib.js";
import { solveSystem, SOLVE_SCHEMA, COMPARE_SYSTEM, COMPARE_SCHEMA } from "./_prompts.js";
import { langOf, say } from "./_i18n.js";
import { requireUser, useCredit, refundCredit, countUse, creditsOf, noCredits, dailyFull } from "./_auth.js";
import { redis, today } from "./_db.js";
import crypto from "node:crypto";

const MAX_PROBLEM = 4000;
const MAX_ANSWER = 300;
// 한 사람이 하루에 미리 풀 수 있는 횟수(관리자 제외). 넘으면 예전처럼 "맞아" 뒤에 푼다.
const PRESOLVE_PER_DAY = Number(process.env.PRESOLVE_PER_DAY || 20);
// 이번 달 비용이 이만큼(달러) 넘으면 미리 풀기를 멈춘다. 콘솔 월 한도 $20보다 조금 낮게.
const PRESOLVE_STOP_DOLLARS = Number(process.env.PRESOLVE_STOP_DOLLARS || 16);

// 두 번 풀기
async function solve(problem, lang) {
  if (MOCK) {
    await new Promise((ok) => setTimeout(ok, 1500)); // 기다리는 시간 흉내
    const s = { solvable: true, issue: "", final_answer: "x = 11", steps: "1. 3x - 6 = 2x + 5\n2. x = 11", key_idea: "이항하면 부호가 바뀐다" };
    return [s, { ...s, final_answer: problem.includes("다름") ? "x = 1" : "x = 11" }];
  }
  const solveOnce = () =>
    askJSON({ system: solveSystem(lang), schema: SOLVE_SCHEMA, effort: "high", messages: [{ role: "user", content: problem }] });
  return Promise.all([solveOnce(), solveOnce()]);
}

// 두 풀이가 같은지 + (있으면) 학생 답 채점을 한 번에
async function compare(problem, solutions, answer) {
  if (!solutions.every((s) => s.solvable)) return { agree: false, student: answer ? "unclear" : "none" };
  if (MOCK) {
    const agree = solutions[0].final_answer === solutions[1].final_answer;
    const student = !answer ? "none" : !agree ? "unclear" : /(^|[^0-9])(11|10)([^0-9]|$)/.test(answer) ? "correct" : "wrong";
    return { agree, student };
  }
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
  let student = answer ? (verdict.same ? verdict.student : "unclear") : "none";
  if (answer && student === "none") student = "unclear";
  return { agree: verdict.same, student };
}

async function presolveAllowed(user) {
  if (user.admin) return true;
  const micro = Number((await redis("GET", `cost:month:${today().slice(0, 7)}`)) || 0);
  if (micro / 1e6 >= PRESOLVE_STOP_DOLLARS) return false;
  const key = `presolve:${today()}:${user.id}`;
  const n = await redis("INCRBY", key, 1);
  if (n === 1) await redis("EXPIRE", key, 2 * 864e2);
  return n <= PRESOLVE_PER_DAY;
}

// 학생 화면으로 돌려줄 것
async function reply(res, user, { problem, check, figure, lang, answer }) {
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
}

export default async function handler(req, res) {
  if (!onlyPost(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;
  // "내 답 확인": 학생이 먼저 낸 답(없으면 보통처럼 대화로 시작)
  const answer = String(req.body?.answer || "").trim().slice(0, MAX_ANSWER);
  // 이 문제는 시작할 때의 언어로 끝까지 대화한다(잠긴 상자에 같이 넣는다)
  const lang = langOf(req);

  // --- "맞아"를 눌렀고 미리 푼 상자가 있을 때: 차감만 하고 바로 쓴다 ---
  if (req.body?.claim) {
    let pre;
    try {
      pre = unseal(req.body.claim);
      if (!pre.pre || pre.user !== user.id) throw new Error("bad");
    } catch {
      return res.status(400).json({ error: say(req, "restart") });
    }
    const ticket = await useCredit(user);
    if (ticket === "credits") return noCredits(res);
    if (ticket === "daily") return dailyFull(res);
    try {
      const { problem, solutions, agree } = pre;
      // 그림은 확인 화면에서 뺄 수도 있으니 지금 보낸 것을 쓴다
      const figure = String(req.body?.figure ?? pre.figure ?? "").slice(0, 600);
      let student = "none";
      if (answer) student = agree ? (await compare(problem, solutions, answer)).student : "unclear";
      return await reply(res, user, { problem, figure, lang: pre.lang, answer, check: { agree, solutions, student } });
    } catch (err) {
      await refundCredit(user).catch(() => {});
      return sendError(res, err);
    }
  }

  const problem = String(req.body?.problem || "").trim();
  // 화면에 다시 그린 그림이 있으면 그 안의 이름들(선생님이 ⟦선분 AB⟧로 짚을 수 있게)
  const figure = String(req.body?.figure || "").slice(0, 600);
  if (!problem || problem.length > MAX_PROBLEM) {
    return res.status(400).json({ error: say(req, "badProblem") });
  }

  // --- 미리 풀기: 차감 없이 풀어서 "아직 못 쓰는 상자"만 준다 ---
  if (req.body?.presolve) {
    try {
      if ((await creditsOf(user)) === 0 || !(await presolveAllowed(user))) return res.json({ skip: true });
      const solutions = await solve(problem, lang);
      const { agree } = await compare(problem, solutions, "");
      // pre: true 상자는 대화·풀이 보기에 못 쓴다. claim으로 바꿔야 쓸 수 있다.
      return res.json({ pre: seal({ pre: true, problem, figure, solutions, agree, user: user.id, lang }) });
    } catch (err) {
      return sendError(res, err);
    }
  }

  // --- 보통: "맞아"를 누른 뒤 풀기 ---
  const ticket = await useCredit(user);
  if (ticket === "credits") return noCredits(res);
  if (ticket === "daily") return dailyFull(res);
  try {
    const solutions = await solve(problem, lang);
    const { agree, student } = await compare(problem, solutions, answer);
    await reply(res, user, { problem, figure, lang, answer, check: { agree, solutions, student } });
  } catch (err) {
    await refundCredit(user).catch(() => {});
    sendError(res, err);
  }
}
