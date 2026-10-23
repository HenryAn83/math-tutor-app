// 화면 흐름: 시작 → 사진 읽기 → "이렇게 읽었는데 맞아?" → 미리 풀어 보기 → 대화
// 사진과 대화는 이 폰 화면에만 있다. 새로고침하면 사라진다.

import { canListen, canSpeak, toggleListening, speak, stopSpeaking } from "./voice.js";

const $ = (id) => document.getElementById(id);

// 비밀 링크(?k=코드)의 코드를 기억하고 주소창에서는 지운다.
const params = new URLSearchParams(location.search);
if (params.get("k")) {
  localStorage.setItem("accessCode", params.get("k"));
  history.replaceState(null, "", location.pathname);
}
let accessCode = localStorage.getItem("accessCode") || "";

const state = {
  candidates: [], // 사진에서 읽은 문제들
  problem: "", // 학생이 확인한 문제 글
  sealed: "", // 서버가 잠가 둔 정답 풀이
  messages: [], // {role, content}
  busy: false,
};

function show(name) {
  for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== `screen-${name}`;
  window.scrollTo(0, 0);
}

function toast(text) {
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

async function api(path, body) {
  const res = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-access-code": accessCode },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    // 코드가 바뀌었거나 틀리면 다시 입력하게 한다
    localStorage.removeItem("accessCode");
    accessCode = "";
    show("code");
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
    state.messages = [];
    $("chat-problem").textContent = state.problem;
    $("check-badge").textContent = result.agree ? "✅ 확인됨" : "⚠️ 같이 확인";
    $("check-badge").className = "badge " + (result.agree ? "ok" : "warn");
    $("messages").innerHTML = "";
    show("chat");
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
  $("messages").append(div);
  div.scrollIntoView({ behavior: "smooth", block: "end" });
  return div;
}

async function sendToTutor() {
  state.busy = true;
  const typing = addBubble("assistant typing", "…");
  try {
    const { reply } = await api("chat", { sealed: state.sealed, messages: state.messages });
    typing.remove();
    state.messages.push({ role: "assistant", content: reply });
    addBubble("assistant", reply);
    if (soundOn) speak(reply);
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
  }
}

async function sendMessage(text) {
  text = text.trim();
  if (!text || state.busy) return;
  stopSpeaking();
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
$("btn-yes").onclick = confirmProblem;
$("btn-retake").onclick = () => show("home");
// ---------- 음성 ----------

let soundOn = false;
try {
  soundOn = localStorage.getItem("soundOn") === "1";
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
      const last = state.messages.findLast((m) => m.role === "assistant");
      speak(last ? last.content : "소리 켰어!");
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
  if (state.messages.length < 2 || confirm("새 문제로 갈까? 지금 대화는 사라져.")) show("home");
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
    show("home");
  } catch (err) {
    // 401이면 api()가 코드를 지우고 입력 화면으로 보낸다. 그 밖의 오류는 연결 문제.
    if (!accessCode) {
      show("code");
      toast("코드가 맞지 않아. 다시 확인해 줄래?");
    } else {
      show("home");
      toast(err.message);
    }
  }
}

$("code-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if ($("code-input").value.trim()) tryCode($("code-input").value);
});

if (accessCode) {
  show("home");
  tryCode(accessCode);
} else show("code");

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
