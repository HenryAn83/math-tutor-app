// 약점 노트. 따로 저장하지 않고, 이 폰에 있는 "풀이 노트"(history.js)에서 그때그때 계산한다.
// 그래서 서버에 새로 남는 건 없고, 지난 문제를 지우면 약점 노트에서도 빠진다.

import { listItems } from "./history.js";

// 한 문제에서 "막혔다"고 보는 기준: 조심할 점이 나왔거나, 끝까지 못 풀었거나, 힌트·모르겠어를 2번 넘게 눌렀을 때
export function struggled(item) {
  const s = item.summary;
  return Boolean(s.stuck) || !s.finished || (item.hints || 0) >= 2;
}

// 힌트·모르겠어 버튼이 보내는 말 (서버 summary.js의 HELP_WORDS와 같게). 몇 번 눌렀는지 세는 데 쓴다
export const HELP_WORDS = ["힌트 좀 줘", "잘 모르겠어", "Can I get a hint?", "I'm not sure"];

// 같은 단원이 "일차 방정식", "일차방정식"처럼 조금 다르게 적혀도 하나로 묶는다
const unitKey = (unit) => String(unit || "").replace(/\s+/g, "").toLowerCase();

const ORDER = { weak: 0, practice: 1, better: 2, good: 3 };

// 단원별로 묶어서 상태를 정한다.
// weak(자주 막혀): 그 단원 최근 3문제 중 2번 이상 막힘
// better(좋아졌어): 예전에 막혔지만 최근 2문제는 막힘 없이 풂
// practice(연습 중): 막힌 적이 있지만 위 둘은 아님
// good(잘하고 있어): 막힌 적 없음
export function weakUnits(items = listItems()) {
  const groups = new Map();
  for (const item of items) {
    if (!item.summary?.unit) continue;
    const key = unitKey(item.summary.unit);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const units = [];
  for (const list of groups.values()) {
    list.sort((a, b) => b.createdAt - a.createdAt); // 최신 먼저
    const flags = list.map(struggled);
    const stuckCount = flags.filter(Boolean).length;
    const recent3 = flags.slice(0, 3).filter(Boolean).length;
    let status = "good";
    if (stuckCount) {
      if (recent3 >= 2) status = "weak";
      else if (list.length >= 3 && !flags[0] && !flags[1]) status = "better";
      else status = "practice";
    }
    units.push({
      unit: list[0].summary.unit, // 가장 최근 이름으로 보여 준다
      status,
      total: list.length,
      stuckCount,
      lastAt: list[0].createdAt,
      // 최근에 조심할 점으로 나온 말 (같은 말은 한 번만)
      stuckLines: [...new Set(list.map((x) => x.summary.stuck).filter(Boolean))].slice(0, 3),
      items: list,
    });
  }
  units.sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.stuckCount - a.stuckCount || b.lastAt - a.lastAt);
  return units;
}

// 선생님에게 넘길 짧은 약점 목록: 자주 막히거나 연습 중인 단원 3개까지, 각 단원의 최근 조심할 점 2개까지.
// 이름이나 날짜 같은 건 보내지 않는다. 서버는 이 문제 대화에만 쓰고 저장하지 않는다.
export function weakForTutor() {
  return weakUnits()
    .filter((u) => u.status === "weak" || u.status === "practice")
    .slice(0, 3)
    .map((u) => ({ unit: u.unit.slice(0, 40), stuck: u.stuckLines.slice(0, 2).map((s) => s.slice(0, 120)) }));
}
