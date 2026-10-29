import { lang, t, SPEECH } from "./i18n.js";

// 푼 문제 기록. 이 폰(브라우저) 안에만 저장하고 서버로는 보내지 않는다.
// 사진은 크니까 저장하지 않고, 문제 글과 대화만 남긴다.

// 한 폰을 여러 명이 쓸 수 있어서 아이디마다 따로 담는다.
let KEY = "history";
const MAX_ITEMS = 100; // 넘치면 가장 오래된 것부터 지운다

function readAll() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  // 저장 공간이 꽉 차면 오래된 기록을 줄여 가며 다시 시도한다
  while (list.length) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return true;
    } catch {
      list = list.slice(0, Math.floor(list.length * 0.8));
    }
  }
  return false;
}

// 로그인한 아이디의 기록을 쓰게 한다. 로그인 전에 쌓인 기록은 처음 로그인한 아이디로 옮긴다.
export function useHistoryOf(userId) {
  KEY = `history:${userId}`;
  try {
    const legacy = localStorage.getItem("history");
    if (legacy && !localStorage.getItem(KEY)) localStorage.setItem(KEY, legacy);
    if (legacy) localStorage.removeItem("history");
  } catch {}
}

// 지금 정리 중인 기록 id (같은 걸 두 번 정리하지 않게)
export const summarizing = new Set();

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// 같은 id면 그 자리에 덮어쓰고, 새 기록은 맨 앞(최신)에 넣는다.
export function saveItem(item) {
  const list = readAll();
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.unshift(item);
  return writeAll(list.slice(0, MAX_ITEMS));
}

export function listItems() {
  return readAll();
}

export function getItem(id) {
  return readAll().find((x) => x.id === id);
}

export function deleteItem(id) {
  writeAll(readAll().filter((x) => x.id !== id));
}

export function formatDate(ms) {
  const d = new Date(ms);
  const today = new Date();
  const time = d.toLocaleTimeString(SPEECH[lang], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return t("date.today", { time });
  const date = d.toLocaleDateString(SPEECH[lang], { month: "short", day: "numeric" });
  return t("date.day", { m: d.getMonth() + 1, d: d.getDate(), date, time });
}
