// 마스터(관리자) 화면: 사용자 목록, 무료 횟수 주기, 계정 정지, 비밀번호 바꿔 주기, 의견, 막힌 개념 통계.
import { checkAccess, onlyPost, sendError } from "./_lib.js";
import { requireAdmin, listUsers, updateUser } from "./_auth.js";
import { readList } from "./_db.js";

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
  if (!onlyPost(req, res) || !checkAccess(req, res)) return;
  if (!(await requireAdmin(req, res))) return;
  const { action, id, change } = req.body || {};
  try {
    if (action === "update") {
      await updateUser(id, change || {});
      return res.json({ ok: true });
    }
    const [users, feedback, stats] = await Promise.all([
      listUsers(),
      readList("feedback", 200),
      readList("stats", 5000),
    ]);
    res.json({
      users,
      feedback,
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
