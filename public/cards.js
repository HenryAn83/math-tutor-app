// 오늘 배운 개념 카드. 문제를 끝낼 때마다 "오늘 배운 핵심" 한 줄을 카드로 모은다.
// 풀이 노트처럼 이 폰(브라우저) 안에만 저장하고 서버로는 보내지 않는다.

let KEY = "cards";
const MAX_CARDS = 300;

function readAll() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_CARDS)));
    return true;
  } catch {
    return false;
  }
}

// 한 폰을 여러 명이 쓸 수 있어서 아이디마다 따로 담는다.
export function useCardsOf(userId) {
  KEY = `cards:${userId}`;
}

export function getCard(id) {
  return readAll().find((c) => c.id === id);
}

// 한 문제(id)에 카드 하나. 이미 있으면 빈 칸만 채운다. 새로 만들었으면 true.
export function saveCard({ id, key, title = "", problem = "", at = Date.now() }) {
  key = String(key || "").trim();
  if (!id || !key) return false;
  const list = readAll();
  const old = list.find((c) => c.id === id);
  if (old) {
    old.title ||= title;
    old.problem ||= problem;
    writeAll(list);
    return false;
  }
  list.unshift({ id, key: key.slice(0, 200), title: title.slice(0, 60), problem: problem.slice(0, 120), at });
  writeAll(list);
  return true;
}

export function listCards() {
  return readAll();
}

export function deleteCard(id) {
  writeAll(readAll().filter((c) => c.id !== id));
}

// 선생님 마무리 말에서 "오늘 배운 핵심: …"(영어 "Key takeaway: …") 줄을 찾는다.
const TAKEAWAY = /^\s*\**\s*(오늘 배운 핵심|(?:today's\s*)?key\s*takeaway)\s*\**\s*[:：]\s*\**\s*(.+)$/im;

export function findTakeaway(text) {
  const m = String(text || "").match(TAKEAWAY);
  return m ? m[2].replace(/\*+$/, "").trim() : "";
}
