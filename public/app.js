// 화면 흐름: 시작 → 사진 읽기 → "이렇게 읽었는데 맞아?" → 미리 풀어 보기 → 대화
// 사진은 저장하지 않는다. 문제 글과 대화는 이 폰 안에만 기록한다(history.js).

import { lang, t, applyStatic } from "./i18n.js";
import { canListen, canSpeak, toggleListening, speak, stopSpeaking, unlockSpeech, nextVoice, voiceCount } from "./voice.js";

const $ = (id) => document.getElementById(id);
import { newId, saveItem, listItems, getItem, deleteItem, formatDate, summarizing, useHistoryOf } from "./history.js";
import { openAdmin } from "./admin.js";
import { usableFigure, figureLabels, drawFigure, markRefs, resolveRef, blink } from "./figure.js";

applyStatic();

// 초대 링크(?k=코드)의 코드는 가입할 때 쓰려고 기억하고, 주소창에서는 지운다.

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
  figure: null, // 다시 그린 문제 그림(figure.js). 없으면 null
  figureSvg: null, // 대화 화면에 그려진 그림
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
    headers: { "Content-Type": "application/json", "x-lang": lang, Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  // 로그인이 풀렸으면 다시 로그인하게 한다
  if (res.status === 401 && data.login) logout();
  if (res.status === 402 && me) {
    me.credits = 0;
    renderMe();
  }
  if (!res.ok) {
    const err = new Error(data.error || t("err.network"));
    if (data.badInvite) err.code = "badInvite";
    throw err;
  }
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
  wait(t("wait.read"), t("wait.readSub"));
  try {
    const image = await shrink(file).catch(() => {
      throw new Error(t("photo.bad"));
    });
    const result = await api("read", { image, mediaType: "image/jpeg" });
    if (!result.problems?.length) {
      show("home");
      toast(result.photo_tip || t("photo.none"));
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
  return p.diagram ? `${p.text}\n\n${t("figure.tag")} ${p.diagram}` : p.text;
}

// ---------- 2. 확인 ----------

function showConfirm(index) {
  const list = $("choice-list");
  list.hidden = state.candidates.length < 2;
  list.innerHTML = "";
  if (state.candidates.length > 1) {
    $("confirm-title").textContent = t("confirm.many");
    state.candidates.forEach((_, i) => {
      const b = document.createElement("button");
      b.className = "btn small" + (i === index ? " primary" : "");
      b.textContent = t("confirm.num", { n: i + 1 });
      b.onclick = () => showConfirm(i);
      list.append(b);
    });
  } else {
    $("confirm-title").textContent = t("confirm.title");
  }
  const p = state.candidates[index];
  state.problem = problemToText(p);
  $("problem-view").textContent = state.problem;
  $("problem-view").hidden = false;
  $("problem-edit").hidden = true;
  $("problem-edit").value = state.problem;
  $("unclear-note").hidden = !p.unclear_parts;
  $("unclear-note").textContent = p.unclear_parts ? t("confirm.unclear", { parts: p.unclear_parts }) : "";
  $("btn-edit").hidden = false;
  state.figure = usableFigure(p.figure);
  renderConfirmFigure();
  show("confirm");
}

// "그림도 이렇게 읽었어" — 다시 그린 그림이 원래 그림과 많이 다르면 빼고 시작할 수 있다.
function renderConfirmFigure() {
  const box = $("figure-confirm");
  box.hidden = !state.figure;
  $("figure-confirm-svg").replaceChildren(state.figure ? drawFigure(state.figure) : "");
}

$("btn-figure-off").onclick = () => {
  state.figure = null;
  renderConfirmFigure();
  toast(t("confirm.figureRemoved"));
};

function startTyping() {
  state.candidates = [];
  $("choice-list").hidden = true;
  $("confirm-title").textContent = t("confirm.typeTitle");
  $("problem-view").hidden = true;
  $("unclear-note").hidden = true;
  $("problem-edit").hidden = false;
  $("problem-edit").value = "";
  $("btn-edit").hidden = true;
  state.figure = null;
  renderConfirmFigure();
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
  if (!state.problem) return toast(t("confirm.empty"));
  wait(t("wait.check"), t("wait.checkSub"));
  try {
    const result = await api("check", { problem: state.problem, figure: figureLabels(state.figure) });
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
  if (role === "assistant") {
    // 그림 이야기(⟦선분 AB⟧)와 핵심설명을 찾아서 꾸민다
    text = markRefs(text, state.figure);
    renderTutorText(div, text);
    if (canSpeak) div.append(replayButton(text));
  } else {
    div.textContent = text;
  }
  $("messages").append(div);
  div.scrollIntoView({ behavior: "smooth", block: "end" });
  return div;
}

// 선생님 말을 [{ text, emphasis }] 덩어리로 나눈다.
// "[핵심설명]"이나 "오늘 배운 핵심:"(영어는 "[Key idea]", "Key takeaway:")으로 시작하는 줄부터 빈 줄까지가 핵심설명이다.
const KEY_START =
  /^\s*\**\s*(\[\s*핵심\s*설명\s*\]|핵심\s*설명\s*[:：]|오늘 배운 핵심\s*[:：]|\[\s*key\s*idea\s*\]|key\s*idea\s*:|(today's\s*)?key\s*takeaway\s*:)\**\s*/i;

function tutorSegments(text) {
  const segments = [];
  let inKey = false;
  for (const line of text.split("\n")) {
    if (KEY_START.test(line)) {
      inKey = true;
      segments.push({ text: line.replace(KEY_START, ""), emphasis: true });
      continue;
    }
    if (inKey && !line.trim()) inKey = false;
    const last = segments.at(-1);
    if (last && last.emphasis === inKey) last.text += "\n" + line;
    else segments.push({ text: line, emphasis: inKey });
  }
  return segments.map((x) => ({ ...x, text: x.text.trim() })).filter((x) => x.text);
}

function renderTutorText(div, text) {
  for (const seg of tutorSegments(text)) {
    const box = document.createElement("div");
    if (seg.emphasis) {
      box.className = "key-block";
      const title = document.createElement("div");
      title.className = "key-title";
      title.textContent = t("chat.keyTitle");
      box.append(title);
    }
    const body = document.createElement("div");
    for (const part of seg.text.split(/(⟦[^⟧]*⟧)/)) {
      if (!part.startsWith("⟦")) {
        body.append(part);
        continue;
      }
      const label = part.slice(1, -1);
      const refs = resolveRef(label, state.figure);
      if (!refs.length) {
        body.append(label);
        continue;
      }
      // 누르면 그림에서 다시 깜빡인다
      const b = document.createElement("button");
      b.type = "button";
      b.className = "fig-ref";
      b.textContent = label;
      b.onclick = () => showOnFigure(refs);
      body.append(b);
    }
    box.append(body);
    div.append(box);
  }
}

// 문장 속 ⟦ ⟧들을 차례로 깜빡인다.
let blinkTimers = [];
function blinkSentence(sentence) {
  const refs = [...sentence.matchAll(/⟦([^⟧]*)⟧/g)].map((m) => resolveRef(m[1], state.figure)).filter((r) => r.length);
  refs.forEach((r, i) => blinkTimers.push(setTimeout(() => showOnFigure(r), i * 1300)));
}

function showOnFigure(refs) {
  if (!state.figureSvg) return;
  // 그림을 접어 뒀으면 펴서 보여 준다
  setFigureOpen(true);
  blink(state.figureSvg, refs, state.figure);
}

// 선생님 말풍선마다 붙는 "다시 듣기" 버튼. 읽는 중에 누르면 멈춘다.
let playingButton = null;

function replayButton(text) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "replay";
  b.textContent = t("chat.replay");
  b.onclick = () => {
    if (playingButton === b) return stopSpeaking();
    playText(text, b);
  };
  return b;
}

function playText(text, button) {
  blinkTimers.forEach(clearTimeout);
  blinkTimers = [];
  // 소리가 실제로 안 나는 폰이면(읽기 시작 신호가 안 오면) 그냥 바로 깜빡인다
  let started = false;
  blinkTimers.push(setTimeout(() => started || blinkSentence(text), 1500));
  speak(tutorSegments(text), {
    onPart: (sentence) => {
      started = true;
      blinkSentence(sentence);
    },
    onEnd: () => {
      if (playingButton !== button) return;
      playingButton = null;
      button.textContent = t("chat.replay");
      button.classList.remove("playing");
    },
  });
  playingButton = button;
  button.textContent = t("chat.stop");
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
    const marked = markRefs(reply, state.figure);
    if (soundOn && canSpeak) playText(marked, bubble.querySelector(".replay"));
    else blinkSentence(marked); // 소리가 꺼져 있으면 말풍선이 뜰 때 바로 깜빡인다
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
      if (last && buttons.length) playText(markRefs(last.content, state.figure), buttons[buttons.length - 1]);
      else speak(t("chat.soundOn"));
    } else {
      stopSpeaking();
    }
  };
  // 🗣 누를 때마다 다음 목소리로 바꾸고 바로 들려준다. 고른 목소리는 폰에 기억된다.
  $("btn-voice").hidden = false;
  $("btn-voice").onclick = () => {
    unlockSpeech();
    if (voiceCount() < 2) return toast(t("voice.onlyOne"));
    const name = nextVoice();
    if (!name) return toast(t("voice.onlyOne"));
    toast(t("voice.changed", { name }));
    speak(t("voice.sample"));
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
        $("chat-input").placeholder = on ? t("chat.listening") : t("chat.ph");
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
  const talked = state.messages.some((m) => m.role === "user");
  if (state.messages.length < 2 || confirm(t("chat.newConfirm"))) {
    const problem = state.problem.split("\n")[0].slice(0, 100);
    leaveCurrent();
    // 한마디라도 나눈 문제면 버튼 두 번으로 끝나는 짧은 의견을 받는다
    if (talked) openQuick(problem);
    else show("home");
  }
};

// ---------- 문제 끝 버튼 의견 ----------

const quick = { about: "", difficulty: "", questions: "" };

function openQuick(about) {
  Object.assign(quick, { about, difficulty: "", questions: "" });
  for (const b of document.querySelectorAll("#screen-quick [data-value]")) b.setAttribute("aria-pressed", "false");
  show("quick");
}

for (const row of document.querySelectorAll("#screen-quick [data-group]")) {
  for (const b of row.querySelectorAll("[data-value]")) {
    b.onclick = () => {
      quick[row.dataset.group] = b.dataset.value;
      for (const x of row.querySelectorAll("[data-value]")) x.setAttribute("aria-pressed", String(x === b));
    };
  }
}

$("btn-quick-skip").onclick = () => show("home");
$("btn-quick-send").onclick = () => {
  if (!quick.difficulty && !quick.questions) return toast(t("quick.pick"));
  // 기다리지 않고 바로 홈으로. 실패해도 아이에게는 알리지 않는다.
  api("feedback", { about: quick.about, difficulty: quick.difficulty, questions: quick.questions }).catch(() => {});
  toast(t("quick.thanks"));
  show("home");
};

// ---------- 사용법 ----------

const slides = $("slides");
const slideCount = slides.children.length;
let tutorialKey = "";

function slideIndex() {
  return Math.round(slides.scrollLeft / slides.clientWidth);
}

function renderDots() {
  const i = slideIndex();
  $("slide-dots").innerHTML = "";
  for (let n = 0; n < slideCount; n++) {
    const d = document.createElement("span");
    if (n === i) d.className = "on";
    $("slide-dots").append(d);
  }
  $("btn-slide-next").textContent = i === slideCount - 1 ? t("tut.start") : t("tut.next");
}

function openTutorial() {
  show("tutorial");
  slides.scrollTo({ left: 0 });
  renderDots();
}

function closeTutorial() {
  try {
    if (tutorialKey) localStorage.setItem(tutorialKey, "1");
  } catch {}
  show("home");
}

slides.addEventListener("scroll", () => requestAnimationFrame(renderDots));
$("btn-slide-next").onclick = () => {
  const i = slideIndex();
  if (i >= slideCount - 1) return closeTutorial();
  slides.scrollTo({ left: (i + 1) * slides.clientWidth, behavior: "smooth" });
};
$("btn-slide-skip").onclick = closeTutorial;
$("btn-tutorial").onclick = openTutorial;
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
  b.onclick = () => sendMessage(t("quick." + b.dataset.quick));
}

// ---------- 로그인 / 가입 ----------

// 초대 링크로 처음 온 사람은 바로 가입 화면을 보여 준다
let signingUp = Boolean(accessCode) && !authToken;

function renderLoginMode() {
  $("login-lead").textContent = t(signingUp ? "login.leadSignup" : "login.lead");
  $("login-name").hidden = !signingUp;
  $("login-free").hidden = !signingUp;
  // 링크에 코드가 있었으면 칸을 숨기고 자동으로 쓴다. 없거나 틀렸으면 직접 넣게 한다.
  $("login-invite").hidden = !signingUp || Boolean(accessCode);
  $("login-pass").autocomplete = signingUp ? "new-password" : "current-password";
  $("login-submit").textContent = t(signingUp ? "login.submitSignup" : "login.submit");
  $("login-switch").textContent = t(signingUp ? "login.toLogin" : "login.toSignup");
}

renderLoginMode();

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
    invite: $("login-invite").value.trim() || accessCode,
  };
  if (!body.id || !body.password || (signingUp && !body.name)) return toast(t("login.blank"));
  $("login-submit").disabled = true;
  try {
    const { token } = await api("auth", body);
    authToken = token;
    localStorage.setItem("authToken", token);
    $("login-pass").value = "";
    await startSession();
  } catch (err) {
    toast(err.message);
    if (/badInvite/.test(err.code)) {
      // 기억해 둔 코드가 틀렸으면 지우고 칸을 보여 준다
      accessCode = "";
      localStorage.removeItem("accessCode");
      renderLoginMode();
      $("login-invite").focus();
    }
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
  // 이 폰에서 이 아이디로 처음 들어왔으면 사용법부터 보여 준다
  tutorialKey = `tutorialDone:${me.id}`;
  let seen = true;
  try {
    seen = localStorage.getItem(tutorialKey) === "1";
  } catch {}
  if (seen || me.admin) show("home");
  else openTutorial();
}

function renderMe() {
  if (!me) return;
  $("me-name").textContent = `${me.name}`;
  const badge = $("me-credits");
  if (me.credits === null) {
    badge.textContent = t("me.unlimited");
    badge.className = "badge ok";
  } else {
    badge.textContent = t("me.credits", { n: me.credits });
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
  if (confirm(t("logout.confirm"))) logout();
};
$("btn-admin").onclick = openAdmin;

// ---------- 의견 보내기 ----------

let feedbackAbout = "";
let feedbackRating = "";

function openFeedback(about = "") {
  feedbackAbout = about;
  feedbackRating = "";
  $("feedback-about").textContent = about ? t("fb.about", { about }) : "";
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
  if (!text && !feedbackRating) return toast(t("fb.empty"));
  $("btn-feedback-send").disabled = true;
  try {
    await api("feedback", { rating: feedbackRating, text, about: feedbackAbout });
    toast(t("fb.thanks"));
    show("home");
  } catch (err) {
    toast(err.message);
  } finally {
    $("btn-feedback-send").disabled = false;
  }
};

if (authToken) {
  show("home");
  startSession().catch((err) => toast(err.message));
} else show("login");

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

// ---------- 지난 문제 ----------
// 푸는 동안에는 대화를 임시로 저장해 두고, 문제를 떠나면 "풀이 노트"로 짧게 정리한 뒤 대화는 지운다.

function openChat() {
  $("chat-problem").textContent = state.problem;
  $("check-badge").textContent = t(state.agree ? "chat.verified" : "chat.unverified");
  $("check-badge").className = "badge " + (state.agree ? "ok" : "warn");
  $("messages").innerHTML = "";
  state.figureSvg = state.figure ? drawFigure(state.figure) : null;
  $("chat-figure").hidden = !state.figure;
  $("chat-figure-svg").replaceChildren(state.figureSvg || "");
  setFigureOpen(true);
  show("chat");
}

function setFigureOpen(open) {
  $("chat-figure").classList.toggle("closed", !open);
  $("btn-figure-toggle").textContent = t(open ? "chat.figureHide" : "chat.figureShow");
}

$("btn-figure-toggle").onclick = () => setFigureOpen($("chat-figure").classList.contains("closed"));

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
  if (!ok) toast(t("history.full"));
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
  $("btn-history").textContent = t("history.button", { n });
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
    const status = t(!item.summary ? "history.summarizing" : item.summary.finished ? "history.finished" : "history.paused");
    meta.textContent = `${formatDate(item.createdAt)} · ${status}`;
    open.append(title, meta);
    open.onclick = () => (item.summary ? showNote(item) : summarize(item.id));
    const del = document.createElement("button");
    del.className = "history-del";
    del.setAttribute("aria-label", t("history.delete"));
    del.textContent = "🗑️";
    del.onclick = () => {
      if (!confirm(t("history.deleteConfirm"))) return;
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
  $("note-answer").textContent = s.answer || t("note.noAnswer");
  $("note-key").textContent = s.key;
  $("note-stuck-box").hidden = !s.stuck;
  $("note-stuck").textContent = s.stuck;
  show("note");
}

$("btn-history").onclick = renderHistory;
$("btn-history-back").onclick = () => show("home");
$("btn-note-back").onclick = renderHistory;
$("btn-note-feedback").onclick = () => openFeedback(noteTitle);
