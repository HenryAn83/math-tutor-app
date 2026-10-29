// 화면 흐름: 시작 → 사진 읽기 → "이렇게 읽었는데 맞아?" → 미리 풀어 보기 → 대화
// 사진은 저장하지 않는다. 문제 글과 대화는 이 폰 안에만 기록한다(history.js).

import { canListen, canSpeak, toggleListening, speak, stopSpeaking, unlockSpeech } from "./voice.js";

const $ = (id) => document.getElementById(id);
import { newId, saveItem, listItems, getItem, deleteItem, formatDate, summarizing, useHistoryOf } from "./history.js";
import { openAdmin } from "./admin.js";

// 비밀 링크(?k=코드)의 코드를 기억하고 주소창에서는 지운다.
const params = new URLSearchParams(location.search);
if (params.get("k")) {
  localStorage.setItem("accessCode", params.get("k"));
  history.replaceState(null, "", location.pathname);
}
let accessCode = localStorage.getItem("accessCode") || "";
let authToken = localStorage.getItem("authToken") || "";
let me = null; // { id, name, admin, credits(null이면 무제한) }

const state = {
  candidates: [], // 사진에서 읽은 문제들
  problem: "", // 학생이 확인한 문제 글
  sealed: "", // 서버가 잠가 둔 정답 풀이
  messages: [], // {role, content}
  busy: false,
  id: "", // 기록에 저장할 때 쓰는 이름표
  createdAt: 0,
  agree: true,
};

export function show(name) {
  for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== `screen-${name}`;
  if (name === "home") renderHistoryButton();
  window.scrollTo(0, 0);
}

export function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 4000);
}

function wait(text, sub = "") {
  $("wait-text").textContent = text;
  $("wait-sub").textContent = sub;
  show("wait");
}

export async function api(path, body) {
  const res = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-access-code": accessCode, Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.login) {
    // 로그인이 풀렸으면 다시 로그인하게 한다
    logout();
  } else if (res.status === 401) {
    // 코드가 바뀌었거나 틀리면 다시 입력하게 한다
    localStorage.removeItem("accessCode");
    accessCode = "";
    show("code");
  }
  if (res.status === 402 && me) {
    me.credits = 0;
    renderMe();
  }
  if (!res.ok) throw new Error(data.error || "앗, 연결에 문제가 생겼어. 다시 해 볼래?");
  return data;
}

// ---------- 1. 사진 ----------

// 폰 사진은 크니까 긴 쪽 1568px JPEG로 줄인다(읽기에는 충분, 전송은 빠르게).
async function shrink(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return dataUrl.split(",")[1];
}

async function onPhoto(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  wait("사진 읽는 중…", "보통 10초쯤 걸려");
  try {
    const image = await shrink(file).catch(() => {
      throw new Error("이 사진은 열 수가 없어. 다른 사진으로 해 볼래?");
    });
    const result = await api("read", { image, mediaType: "image/jpeg" });
    if (!result.problems?.length) {
      show("home");
      toast(result.photo_tip || "문제를 못 찾았어. 문제 하나만 크게 다시 찍어 줄래?");
      return;
    }
    state.candidates = result.problems;
    showConfirm(0);
  } catch (err) {
    show("home");
    toast(err.message);
  }
}

function problemToText(p) {
  return p.diagram ? `${p.text}\n\n[그림] ${p.diagram}` : p.text;
}

// ---------- 2. 확인 ----------

function showConfirm(index) {
  const list = $("choice-list");
  list.hidden = state.candidates.length < 2;
  list.innerHTML = "";
  if (state.candidates.length > 1) {
    $("confirm-title").textContent = "문제가 여러 개 보여. 어떤 걸 할까?";
    state.candidates.forEach((_, i) => {
      const b = document.createElement("button");
      b.className = "btn small" + (i === index ? " primary" : "");
      b.textContent = `${i + 1}번`;
      b.onclick = () => showConfirm(i);
      list.append(b);
    });
  } else {
    $("confirm-title").textContent = "이렇게 읽었는데 맞아?";
  }
  const p = state.candidates[index];
  state.problem = problemToText(p);
  $("problem-view").textContent = state.problem;
  $("problem-view").hidden = false;
  $("problem-edit").hidden = true;
  $("problem-edit").value = state.problem;
  $("unclear-note").hidden = !p.unclear_parts;
  $("unclear-note").textContent = p.unclear_parts ? `잘 안 보인 부분: ${p.unclear_parts}. 틀렸으면 '고칠게'를 눌러 줘.` : "";
  $("btn-edit").hidden = false;
  show("confirm");
}

function startTyping() {
  state.candidates = [];
  $("choice-list").hidden = true;
  $("confirm-title").textContent = "문제를 적어 줘";
  $("problem-view").hidden = true;
  $("unclear-note").hidden = true;
  $("problem-edit").hidden = false;
  $("problem-edit").value = "";
  $("btn-edit").hidden = true;
  show("confirm");
  $("problem-edit").focus();
}

function editProblem() {
  $("problem-view").hidden = true;
  $("problem-edit").hidden = false;
  $("btn-edit").hidden = true;
  $("problem-edit").focus();
}

async function confirmProblem() {
  if (!$("problem-edit").hidden) state.problem = $("problem-edit").value.trim();
  if (!state.problem) return toast("문제를 먼저 적어 줘!");
  wait("선생님이 먼저 풀어 보는 중…", "틀린 걸 알려 주면 안 되니까 두 번 풀어서 맞춰 볼게. 30초~1분쯤 걸려.");
  try {
    const result = await api("check", { problem: state.problem });
    state.sealed = result.sealed;
    if (me && result.credits !== undefined) {
      me.credits = result.credits;
      renderMe();
    }
    state.messages = [];
    state.id = newId();
    state.createdAt = Date.now();
    state.agree = result.agree;
    openChat();
    await sendToTutor();
  } catch (err) {
    show("confirm");
    toast(err.message);
  }
}

// ---------- 3. 대화 ----------

function addBubble(role, text) {
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.textContent = text;
  if (role === "assistant" && canSpeak) div.append(replayButton(text));
  $("messages").append(div);
  div.scrollIntoView({ behavior: "smooth", block: "end" });
  return div;
}

// 선생님 말풍선마다 붙는 "다시 듣기" 버튼. 읽는 중에 누르면 멈춘다.
let playingButton = null;

function replayButton(text) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "replay";
  b.textContent = "🔊 다시 듣기";
  b.onclick = () => {
    if (playingButton === b) return stopSpeaking();
    playText(text, b);
  };
  return b;
}

function playText(text, button) {
  speak(text, {
    onEnd: () => {
      if (playingButton !== button) return;
      playingButton = null;
      button.textContent = "🔊 다시 듣기";
      button.classList.remove("playing");
    },
  });
  playingButton = button;
  button.textContent = "⏹ 그만 듣기";
  button.classList.add("playing");
}

async function sendToTutor() {
  state.busy = true;
  const typing = addBubble("assistant typing", "…");
  try {
    const { reply } = await api("chat", { sealed: state.sealed, messages: state.messages });
    typing.remove();
    state.messages.push({ role: "assistant", content: reply });
    const bubble = addBubble("assistant", reply);
    if (soundOn && canSpeak) playText(reply, bubble.querySelector(".replay"));
  } catch (err) {
    typing.remove();
    // 실패한 학생 메시지는 빼서 다시 보낼 수 있게 한다
    const last = state.messages.at(-1);
    if (last?.role === "user") {
      state.messages.pop();
      $("messages").lastElementChild?.remove();
      $("chat-input").value = last.content;
    }
    toast(err.message);
  } finally {
    state.busy = false;
    if (state.messages.at(-1)?.role === "assistant") saveCurrent();
  }
}

async function sendMessage(text) {
  text = text.trim();
  if (!text || state.busy) return;
  stopSpeaking();
  if (soundOn) unlockSpeech();
  state.messages.push({ role: "user", content: text });
  addBubble("user", text);
  $("chat-input").value = "";
  autoGrow();
  await sendToTutor();
}

function autoGrow() {
  const el = $("chat-input");
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 140) + "px";
}

// ---------- 연결 ----------

$("input-camera").addEventListener("change", onPhoto);
$("input-album").addEventListener("change", onPhoto);
$("btn-type").onclick = startTyping;
$("btn-edit").onclick = editProblem;
$("btn-yes").onclick = () => {
  if (soundOn) unlockSpeech();
  confirmProblem();
};
$("btn-retake").onclick = () => show("home");
// ---------- 음성 ----------

// 기본은 켜짐. 위쪽 🔊 버튼으로 끄면 이 폰이 기억한다.
let soundOn = true;
try {
  soundOn = localStorage.getItem("soundOn") !== "0";
} catch {}

function renderSound() {
  $("btn-sound").textContent = soundOn ? "🔊" : "🔇";
  $("btn-sound").setAttribute("aria-pressed", String(soundOn));
}

if (canSpeak) {
  $("btn-sound").hidden = false;
  renderSound();
  $("btn-sound").onclick = () => {
    soundOn = !soundOn;
    try {
      localStorage.setItem("soundOn", soundOn ? "1" : "0");
    } catch {}
    renderSound();
    if (soundOn) {
      // 버튼을 누른 순간에 한 번 말해야 아이폰에서도 소리가 열린다
      unlockSpeech();
      const buttons = $("messages").querySelectorAll(".replay");
      const last = state.messages.findLast((m) => m.role === "assistant");
      if (last && buttons.length) playText(last.content, buttons[buttons.length - 1]);
      else speak("소리 켰어!");
    } else {
      stopSpeaking();
    }
  };
}

if (canListen) {
  $("btn-mic").hidden = false;
  let before = "";
  $("btn-mic").onclick = () => {
    if (state.busy) return;
    toggleListening({
      onState: (on) => {
        $("btn-mic").classList.toggle("listening", on);
        $("chat-input").placeholder = on ? "듣고 있어… 말해 봐" : "생각을 적어 봐";
        if (on) before = $("chat-input").value ? $("chat-input").value + " " : "";
      },
      // 말한 내용은 바로 보내지 않고 입력칸에 넣는다. 잘못 들었으면 고치고 보내면 된다.
      onText: (text) => {
        $("chat-input").value = before + text;
        autoGrow();
      },
      onError: toast,
    });
  };
}

$("btn-new").onclick = () => {
  stopSpeaking();
  if (state.messages.length < 2 || confirm("새 문제로 갈까? 지금까지 푼 과정은 '지난 문제'에 정리해 둘게.")) {
    leaveCurrent();
    show("home");
  }
};
$("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage($("chat-input").value);
});
$("chat-input").addEventListener("input", autoGrow);
$("chat-input").addEventListener("keydown", (e) => {
  // 컴퓨터에서는 Enter로 보내기, 폰 키보드는 보내기 버튼 사용
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(pointer: fine)").matches) {
    e.preventDefault();
    sendMessage($("chat-input").value);
  }
});
for (const b of document.querySelectorAll("[data-quick]")) {
  b.onclick = () => sendMessage(b.dataset.quick);
}

// ---------- 입장 코드 ----------

async function tryCode(code) {
  accessCode = code.trim();
  try {
    await api("access", {});
    localStorage.setItem("accessCode", accessCode);
    await startSession();
  } catch (err) {
    // 401이면 api()가 코드를 지우고 입력 화면으로 보낸다. 그 밖의 오류는 연결 문제.
    if (!accessCode) {
      show("code");
      toast("코드가 맞지 않아. 다시 확인해 줄래?");
    } else if (authToken) {
      show("home");
      toast(err.message);
    } else {
      show("login");
    }
  }
}

$("code-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if ($("code-input").value.trim()) tryCode($("code-input").value);
});

// ---------- 로그인 / 가입 ----------

let signingUp = false;

function renderLoginMode() {
  $("login-lead").textContent = signingUp ? "처음 왔구나! 아이디를 만들어 줘." : "아이디로 들어와 줘.";
  $("login-name").hidden = !signingUp;
  $("login-free").hidden = !signingUp;
  $("login-pass").autocomplete = signingUp ? "new-password" : "current-password";
  $("login-submit").textContent = signingUp ? "가입하고 시작" : "들어가기";
  $("login-switch").textContent = signingUp ? "이미 아이디가 있어? 로그인" : "처음이야? 가입하기";
}

$("login-switch").onclick = () => {
  signingUp = !signingUp;
  renderLoginMode();
};

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    action: signingUp ? "signup" : "login",
    id: $("login-id").value.trim(),
    password: $("login-pass").value,
    name: $("login-name").value.trim(),
  };
  if (!body.id || !body.password || (signingUp && !body.name)) return toast("빈칸을 다 채워 줘!");
  $("login-submit").disabled = true;
  try {
    const { token } = await api("auth", body);
    authToken = token;
    localStorage.setItem("authToken", token);
    $("login-pass").value = "";
    await startSession();
  } catch (err) {
    toast(err.message);
  } finally {
    $("login-submit").disabled = false;
  }
});

// 로그인 표가 있으면 내 정보를 받아 시작 화면으로, 없으면 로그인 화면으로.
async function startSession() {
  if (!authToken) return show("login");
  const info = await api("auth", { action: "me" });
  me = info;
  useHistoryOf(me.id);
  $("btn-admin").hidden = !me.admin;
  renderMe();
  show("home");
}

function renderMe() {
  if (!me) return;
  $("me-name").textContent = `${me.name}`;
  const badge = $("me-credits");
  if (me.credits === null) {
    badge.textContent = "무제한";
    badge.className = "badge ok";
  } else {
    badge.textContent = `남은 무료 문제 ${me.credits}개`;
    badge.className = "badge " + (me.credits > 0 ? "ok" : "none");
  }
}

function logout() {
  authToken = "";
  me = null;
  localStorage.removeItem("authToken");
  signingUp = false;
  renderLoginMode();
  show("login");
}

$("btn-logout").onclick = () => {
  if (confirm("로그아웃할까?")) logout();
};
$("btn-admin").onclick = openAdmin;

// ---------- 의견 보내기 ----------

let feedbackAbout = "";
let feedbackRating = "";

function openFeedback(about = "") {
  feedbackAbout = about;
  feedbackRating = "";
  $("feedback-about").textContent = about ? `문제: ${about}` : "";
  $("feedback-about").hidden = !about;
  $("feedback-text").value = "";
  for (const b of document.querySelectorAll("[data-rating]")) b.setAttribute("aria-pressed", "false");
  show("feedback");
}

for (const b of document.querySelectorAll("[data-rating]")) {
  b.onclick = () => {
    feedbackRating = feedbackRating === b.dataset.rating ? "" : b.dataset.rating;
    for (const x of document.querySelectorAll("[data-rating]")) {
      x.setAttribute("aria-pressed", String(x.dataset.rating === feedbackRating));
    }
  };
}

$("btn-feedback").onclick = () => openFeedback();
$("btn-feedback-back").onclick = () => show("home");
$("btn-feedback-send").onclick = async () => {
  const text = $("feedback-text").value.trim();
  if (!text && !feedbackRating) return toast("한 줄이라도 적어 줄래?");
  $("btn-feedback-send").disabled = true;
  try {
    await api("feedback", { rating: feedbackRating, text, about: feedbackAbout });
    toast("고마워! 잘 받았어 😊");
    show("home");
  } catch (err) {
    toast(err.message);
  } finally {
    $("btn-feedback-send").disabled = false;
  }
};

if (accessCode) {
  if (authToken) show("home");
  tryCode(accessCode);
} else show("code");

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

// ---------- 지난 문제 ----------
// 푸는 동안에는 대화를 임시로 저장해 두고, 문제를 떠나면 "풀이 노트"로 짧게 정리한 뒤 대화는 지운다.

function openChat() {
  $("chat-problem").textContent = state.problem;
  $("check-badge").textContent = state.agree ? "✅ 확인됨" : "⚠️ 같이 확인";
  $("check-badge").className = "badge " + (state.agree ? "ok" : "warn");
  $("messages").innerHTML = "";
  show("chat");
}

function saveCurrent() {
  if (!state.id) return;
  const ok = saveItem({
    id: state.id,
    createdAt: state.createdAt,
    problem: state.problem,
    agree: state.agree,
    sealed: state.sealed,
    messages: state.messages,
  });
  if (!ok) toast("폰 저장 공간이 부족해서 기록을 못 남겼어.");
}

// 지금 푸는 문제를 내려놓는다. 정리는 뒤에서 조용히 한다.
function leaveCurrent() {
  const id = state.id;
  state.id = "";
  if (id) summarize(id);
}

async function summarize(id) {
  const item = getItem(id);
  if (!item || item.summary || summarizing.has(id)) return;
  // 학생이 한마디도 안 한 기록은 남길 게 없다
  if (!item.messages.some((m) => m.role === "user")) return deleteItem(id);
  summarizing.add(id);
  try {
    const summary = await api("summary", { sealed: item.sealed, messages: item.messages });
    const latest = getItem(id);
    if (latest) {
      saveItem({ id, createdAt: latest.createdAt, problem: latest.problem, agree: latest.agree, summary });
    }
  } catch {
    // 실패하면 대화를 그대로 두고 다음에 다시 정리한다
  } finally {
    summarizing.delete(id);
    if (!$("screen-history").hidden) renderHistory();
    if (!$("screen-home").hidden) renderHistoryButton();
  }
}

// 앱을 그냥 닫아서 정리 못 한 기록이 있으면 지금 정리한다.
function summarizePending() {
  for (const item of listItems()) if (!item.summary && item.id !== state.id) summarize(item.id);
}

function renderHistoryButton() {
  const n = listItems().length;
  $("btn-history").hidden = n === 0;
  $("btn-history").textContent = `📚 지난 문제 ${n}개`;
  summarizePending();
}

function renderHistory() {
  const list = $("history-list");
  list.innerHTML = "";
  const items = listItems();
  $("history-empty").hidden = items.length > 0;
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "history-item card";
    const open = document.createElement("button");
    open.className = "history-open";
    const title = document.createElement("div");
    title.className = "history-title";
    title.textContent = item.summary?.title || item.problem.split("\n")[0];
    const meta = document.createElement("div");
    meta.className = "sub";
    const status = !item.summary ? "정리 중…" : item.summary.finished ? "✅ 다 풀었어" : "⏸ 풀다 멈춤";
    meta.textContent = `${formatDate(item.createdAt)} · ${status}`;
    open.append(title, meta);
    open.onclick = () => (item.summary ? showNote(item) : summarize(item.id));
    const del = document.createElement("button");
    del.className = "history-del";
    del.setAttribute("aria-label", "지우기");
    del.textContent = "🗑️";
    del.onclick = () => {
      if (!confirm("이 기록을 지울까? 되돌릴 수 없어.")) return;
      deleteItem(item.id);
      renderHistory();
    };
    row.append(open, del);
    list.append(row);
  }
  show("history");
}

let noteTitle = "";

function showNote(item) {
  const s = item.summary;
  $("note-title").textContent = s.title;
  noteTitle = s.title;
  $("note-date").textContent = formatDate(item.createdAt);
  $("note-problem").textContent = item.problem;
  const steps = $("note-steps");
  steps.innerHTML = "";
  for (const step of s.steps) {
    const li = document.createElement("li");
    li.textContent = step;
    steps.append(li);
  }
  $("note-answer").textContent = s.answer || "아직 못 풀었어";
  $("note-key").textContent = s.key;
  $("note-stuck-box").hidden = !s.stuck;
  $("note-stuck").textContent = s.stuck;
  show("note");
}

$("btn-history").onclick = renderHistory;
$("btn-history-back").onclick = () => show("home");
$("btn-note-back").onclick = renderHistory;
$("btn-note-feedback").onclick = () => openFeedback(noteTitle);
