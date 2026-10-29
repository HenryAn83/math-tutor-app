// 관리 화면 (마스터 계정만 보임): 사용자, 무료 횟수, 막힌 단원 통계, 의견.
import { api, show, toast } from "./app.js";
import { formatDate } from "./history.js";

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label, onClick) {
  const b = el("button", "btn small", label);
  b.onclick = onClick;
  return b;
}

async function change(id, change, done) {
  try {
    await api("admin", { action: "update", id, change });
    toast(done);
    await load();
  } catch (err) {
    toast(err.message);
  }
}

function renderUsers(users) {
  $("admin-user-count").textContent = `${users.length}명`;
  const box = $("admin-users");
  box.innerHTML = "";
  if (!users.length) box.append(el("p", "sub", "아직 가입한 사람이 없어요."));
  for (const u of users) {
    const item = el("div", "admin-item");
    const title = el("div", "title" + (u.disabled ? " off" : ""), `${u.name} (${u.id})`);
    const left = u.unlimited ? "무제한" : `남은 ${u.credits}개`;
    const meta = el("div", "sub", `${left} · 푼 문제 ${u.used}개 · 가입 ${formatDate(u.createdAt)}${u.disabled ? " · 정지됨" : ""}`);
    const row = el("div", "row");
    row.append(
      button("+1", () => change(u.id, { addCredits: 1 }, `${u.name}에게 1개 줬어요`)),
      button("+5", () => change(u.id, { addCredits: 5 }, `${u.name}에게 5개 줬어요`)),
      button(u.unlimited ? "무제한 끄기" : "무제한", () =>
        change(u.id, { unlimited: !u.unlimited }, u.unlimited ? "무제한을 껐어요" : "무제한으로 바꿨어요"),
      ),
      button(u.disabled ? "정지 풀기" : "정지", () => {
        if (!u.disabled && !confirm(`${u.name} 계정을 정지할까요? 바로 로그아웃돼요.`)) return;
        change(u.id, { disabled: !u.disabled }, u.disabled ? "정지를 풀었어요" : "정지했어요");
      }),
      button("비밀번호 바꾸기", () => {
        const pw = prompt(`${u.name}의 새 비밀번호 (4자 이상)`);
        if (pw) change(u.id, { newPassword: pw }, "비밀번호를 바꿨어요. 새 비밀번호를 알려 주세요.");
      }),
    );
    item.append(title, meta, row);
    box.append(item);
  }
}

function renderGroups(box, groups) {
  box.innerHTML = "";
  if (!groups.length) box.append(el("p", "sub", "아직 기록이 없어요."));
  for (const g of groups) {
    const item = el("div", "admin-item");
    item.append(
      el("div", "title", g.name),
      el("div", "sub", `${g.count}문제 · 막힘 ${g.stuck} · 못 끝냄 ${g.unfinished} · 힌트 ${g.hints}번 · ${g.kids}명`),
    );
    box.append(item);
  }
}

function renderStuck(list) {
  const box = $("admin-stuck");
  box.innerHTML = "";
  if (!list.length) box.append(el("p", "sub", "아직 기록이 없어요."));
  for (const s of list) {
    const item = el("div", "admin-item");
    item.append(
      el("div", "title", `${s.unit} · ${s.title}`),
      el("div", "", s.stuck),
      el("div", "sub", `${s.name} · ${formatDate(s.at)}${s.finished ? "" : " · 못 끝냄"}`),
    );
    box.append(item);
  }
}

function renderFeedback(list) {
  $("admin-fb-count").textContent = `${list.length}개`;
  const box = $("admin-feedback");
  box.innerHTML = "";
  if (!list.length) box.append(el("p", "sub", "아직 의견이 없어요."));
  for (const f of list) {
    const item = el("div", "admin-item");
    const face = f.rating === "up" ? "👍 " : f.rating === "down" ? "👎 " : "";
    const tags = [DIFFICULTY[f.difficulty], f.questions && `질문 ${QUESTIONS[f.questions]}`].filter(Boolean).join(" · ");
    item.append(
      el("div", "", face + (f.text || tags)),
      el("div", "sub", `${f.name} · ${formatDate(f.at)}${f.about ? ` · ${f.about}` : ""}`),
    );
    box.append(item);
  }
}

const MONTHLY_BUDGET = 20; // 콘솔에 걸어 둔 월 한도($)
const DIFFICULTY = { easy: "😊 쉬웠어", ok: "🙂 적당", hard: "😵 어려웠어" };
const QUESTIONS = { many: "질문 많았어", ok: "적당", few: "적었어" };

function renderMoney(data) {
  const box = $("admin-money");
  box.innerHTML = "";
  const usd = (n) => `$${n.toFixed(2)}`;
  const monthWarn = data.month.cost >= MONTHLY_BUDGET * 0.8 ? " ⚠️ 한도 가까움" : "";
  box.append(
    el("div", "", `오늘 문제: ${data.today.used} / ${data.today.limit}개`),
    el("div", "", `오늘 비용: ${usd(data.today.cost)}`),
    el("div", "", `이번 달 비용: ${usd(data.month.cost)} / 한도 $${MONTHLY_BUDGET}${monthWarn}`),
    el("div", "sub", "실제로 쓴 토큰으로 계산한 값이에요. 정확한 청구액은 Anthropic 콘솔에서 확인하세요."),
  );
}

function summarize(counts, names) {
  return Object.entries(names)
    .map(([k, label]) => `${label} ${counts[k] || 0}`)
    .join(" · ");
}

async function load() {
  const data = await api("admin", { action: "overview" });
  renderMoney(data);
  $("admin-quick").textContent = `난이도: ${summarize(data.quick.difficulty, DIFFICULTY)}\n질문 수: ${summarize(data.quick.questions, QUESTIONS)}`;
  renderUsers(data.users);
  $("admin-stat-total").textContent = `(${data.stats.total}문제)`;
  renderGroups($("admin-units"), data.stats.units);
  renderGroups($("admin-concepts"), data.stats.concepts);
  renderStuck(data.stats.recentStuck);
  renderFeedback(data.feedback);
}

export async function openAdmin() {
  try {
    await load();
    show("admin");
  } catch (err) {
    toast(err.message);
  }
}

$("btn-admin-refresh").onclick = () => load().catch((err) => toast(err.message));
$("btn-admin-back").onclick = () => show("home");
