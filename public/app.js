// 화면 흐름: 시작 → 사진 읽기 → "이렇게 읽었는데 맞아?" → 미리 풀어 보기 → 대화
// 사진과 대화는 이 폰 화면에만 있다. 새로고침하면 사라진다.

const $ = (id) => document.getElementById(id);

// 비밀 링크(?k=코드)의 코드를 기억하고 주소창에서는 지운다.
const params = new URLSearchParams(location.search);
if (params.get("k")) {
  localStorage.setItem("accessCode", params.get("k"));
  history.replaceState(null, "", location.pathname);
}
const accessCode = localStorage.getItem("accessCode") || "";

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
$("btn-new").onclick = () => {
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

if (!accessCode) toast("받은 링크로 다시 들어와 줘.");

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
