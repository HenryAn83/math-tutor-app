// 약점 노트: 학생 폰이 풀이 노트에서 계산한 "자주 막힌 단원" 목록을 대화 요청에 같이 보내온다.
// 서버는 이걸 이번 대화의 선생님 지침에만 붙이고, 어디에도 저장하지 않는다.

// 폰에서 온 값은 믿지 말고 모양과 길이를 다듬는다: 단원 3개까지, 각 단원 조심할 점 2개까지.
export function cleanWeak(raw) {
  if (!Array.isArray(raw)) return [];
  const text = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return raw
    .slice(0, 3)
    .map((w) => ({
      unit: text(w?.unit, 40),
      stuck: (Array.isArray(w?.stuck) ? w.stuck : []).slice(0, 2).map((s) => text(s, 120)).filter(Boolean),
    }))
    .filter((w) => w.unit);
}

export function weakNote(raw, lang = "ko") {
  const weak = cleanWeak(raw);
  if (!weak.length) return "";
  const list = weak
    .map((w) => `- ${w.unit}${w.stuck.length ? `: ${w.stuck.join(" / ")}` : ""}`)
    .join("\n");
  if (lang === "en") {
    return `

[Student's weak spots - from their own past problem notes]
${list}
- If today's problem uses one of these units or the same kind of mistake could happen, give a short heads-up right at that step, once. e.g. "Last time this part was tricky. Take it slow here." Then let the student do it.
- If today's problem has nothing to do with them, don't mention them at all.
- Don't count this as an extra question, don't lecture about past mistakes, and keep it encouraging. Never make the student feel watched or judged.
- If the student gets that exact spot right, praise it specifically. e.g. "You nailed the part that tripped you up last time!"`;
  }
  return `

[학생의 약점 - 학생이 전에 푼 문제의 풀이 노트에서 모은 것]
${list}
- 오늘 문제가 이 단원이거나 같은 실수가 나올 수 있는 단계가 있으면, 그 단계에서 딱 한 번 짧게 미리 짚어 준다. 예: "지난번에 여기서 헷갈렸지? 이번엔 천천히 해 보자." 그리고 학생이 직접 하게 한다.
- 오늘 문제와 관계없으면 약점 이야기는 아예 꺼내지 않는다.
- 질문 수를 늘리지 않는다. 지난 실수를 길게 설명하거나 혼내는 말투는 쓰지 않는다. 감시당한다는 느낌이 들지 않게 한다.
- 학생이 그 지점을 맞게 해내면 구체적으로 칭찬한다. 예: "지난번에 막혔던 데를 이번엔 혼자 해냈네!"`;
}
