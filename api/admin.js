// 마스터(관리자) 화면: 사용자 목록, 무료 횟수 주기, 계정 정지, 비밀번호 바꿔 주기, 의견, 막힌 개념 통계.
import { onlyPost, sendError } from "./_lib.js";
import { requireAdmin, listUsers, updateUser, dailyUsed, DAILY_LIMIT } from "./_auth.js";
import { readList, redis, today } from "./_db.js";
import { ttsKey, TTS_LIMIT, TTS_ON } from "./tts.js";

const dollars = (micro) => Number(micro || 0) / 1e6;

// 문제 끝 버튼 의견을 항목별로 센다
function countChoices(feedback, field) {
  const counts = {};
  for (const f of feedback) if (f[field]) counts[f[field]] = (counts[f[field]] || 0) + 1;
  return counts;
}

// 단원(또는 개념)별로 몇 번 풀었고, 몇 번 막혔고, 힌트를 얼마나 썼는지
function groupBy(stats, field) {
  const groups = new Map();
  for (const s of stats) {
    const name = (s[field] || "기타").trim();
    const g = groups.get(name) || { name, count: 0, stuck: 0, unfinished: 0, hints: 0, kids: new Set() };
    g.count++;
    if (s.stuck) g.stuck++;
    if (!s.finished) g.unfinished++;
    g.hints += s.hints || 0;
    g.kids.add(s.user);
    groups.set(name, g);
  }
  return [...groups.values()]
    .map(({ kids, ...g }) => ({ ...g, kids: kids.size }))
    .sort((a, b) => b.stuck + b.unfinished - (a.stuck + a.unfinished) || b.count - a.count);
}

export default async function handler(req, res) {
  if (!onlyPost(req, res)) return;
  if (!(await requireAdmin(req, res))) return;
  const { action, id, change } = req.body || {};
  try {
    if (action === "update") {
      await updateUser(id, change || {});
      return res.json({ ok: true });
    }
    const day = today();
    const [users, feedback, stats, used, costDay, costMonth, ttsChars] = await Promise.all([
      listUsers(),
      readList("feedback", 1000),
      readList("stats", 5000),
      dailyUsed(),
      redis("GET", `cost:day:${day}`),
      redis("GET", `cost:month:${day.slice(0, 7)}`),
      redis("GET", ttsKey(day)),
    ]);
    res.json({
      users,
      today: { used, limit: DAILY_LIMIT, cost: dollars(costDay) },
      month: { cost: dollars(costMonth), ttsChars: Number(ttsChars || 0), ttsLimit: TTS_LIMIT, ttsOn: TTS_ON },
      quick: { difficulty: countChoices(feedback, "difficulty"), questions: countChoices(feedback, "questions") },
      feedback: feedback.slice(0, 200),
      stats: {
        total: stats.length,
        units: groupBy(stats, "unit"),
        concepts: groupBy(stats, "key").slice(0, 20),
        recentStuck: stats.filter((s) => s.stuck).slice(0, 30),
      },
    });
  } catch (err) {
    sendError(res, err);
  }
}
