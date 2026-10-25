// 음성 기능: 브라우저에 들어 있는 무료 기능만 쓴다(서버, 비용 없음).
// 🎤 말하기 → 글자로 바꿔 입력칸에 넣기 / 🔊 선생님 말 읽어 주기

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = !!Recognition;
export const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

// ---------- 🎤 듣기 ----------

let recognizer = null;

// onText(글자, 끝났는지) 를 계속 불러 준다. 다시 부르면 멈춘다.
export function toggleListening({ onText, onState, onError }) {
  if (recognizer) {
    recognizer.stop();
    return;
  }
  stopSpeaking();
  recognizer = new Recognition();
  recognizer.lang = "ko-KR";
  recognizer.interimResults = true;
  recognizer.continuous = false;
  recognizer.onresult = (e) => {
    const text = [...e.results].map((r) => r[0].transcript).join("");
    onText(text, e.results[e.results.length - 1].isFinal);
  };
  recognizer.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      onError("마이크를 쓸 수 있게 허용해 줘. (설정 → 브라우저 → 마이크)");
    } else if (e.error === "no-speech") {
      onError("소리가 안 들렸어. 🎤 누르고 다시 말해 줄래?");
    } else if (e.error !== "aborted") {
      onError("음성 인식이 잘 안 됐어. 글자로 써 줄래?");
    }
  };
  recognizer.onend = () => {
    recognizer = null;
    onState(false);
  };
  recognizer.start();
  onState(true);
}

// ---------- 🔊 읽어 주기 ----------

const LETTERS = {
  a: "에이", b: "비", c: "씨", d: "디", e: "이", f: "에프", g: "지", h: "에이치",
  k: "케이", l: "엘", m: "엠", n: "엔", p: "피", q: "큐", r: "알", s: "에스",
  t: "티", x: "엑스", y: "와이", z: "제트",
};

// 수식을 말로 읽기 좋게 바꾼다. 예: "x² + 3/4 = 1" → "엑스 제곱 더하기 4분의 3 는 1"
// 화면에 보이는 글은 그대로 두고, 소리로 읽을 때만 바꾼다.
export function mathToSpeech(text) {
  return (
    text
      // 이모지 빼기
      .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
      // 분수 a/b → b분의 a
      .replace(/(\(?[\w.²³]+\)?)\s*\/\s*(\(?[\w.²³]+\)?)/g, "$2분의 $1")
      // x^2 처럼 쓴 거듭제곱
      .replace(/\^\s*2(?!\d)/g, "²")
      .replace(/\^\s*3(?!\d)/g, "³")
      .replace(/\^\s*(\d+)/g, "의 $1제곱")
      .replace(/[⁴⁵⁶⁷⁸⁹]/g, (c) => `의 ${"⁴⁵⁶⁷⁸⁹".indexOf(c) + 4}제곱`)
      .replace(/²/g, " 제곱")
      .replace(/³/g, " 세제곱")
      .replace(/√\s*\(([^)]*)\)/g, "루트 $1")
      .replace(/√/g, "루트 ")
      .replace(/×/g, " 곱하기 ")
      .replace(/÷/g, " 나누기 ")
      // 부등호: "x ≥ 2" → "엑스 는 2 이상"
      .replace(/\s*≤\s*([^\s,.?!]+)/g, " 는 $1 이하")
      .replace(/\s*≥\s*([^\s,.?!]+)/g, " 는 $1 이상")
      .replace(/\s*≠\s*([^\s,.?!]+)/g, " 는 $1 이 아니다")
      .replace(/π/g, "파이")
      .replace(/∠/g, "각 ")
      .replace(/△/g, "삼각형 ")
      .replace(/∥/g, " 평행 ")
      .replace(/⊥/g, " 수직 ")
      .replace(/°/g, "도")
      .replace(/%/g, "퍼센트")
      .replace(/∴/g, "따라서 ")
      .replace(/→/g, ", ")
      .replace(/[·•]/g, " ")
      .replace(/\s=\s|=/g, " 는 ")
      .replace(/\s\+\s|\+/g, " 더하기 ")
      // 빼기/음수: 숫자나 글자 사이의 - 만 바꾼다(문장 속 하이픈은 그대로)
      .replace(/([\w)²³]|제곱)\s+[-−]\s+(?=[\w(√])/g, "$1 빼기 ")
      .replace(/([\d)²³])[-−](?=[\w(√])|([\w)])[-−](?=\d)/g, (m, a, b) => `${a ?? b} 빼기 `)
      .replace(/(?<![A-Za-z])([A-Za-z])[-−](?=[A-Za-z](?![A-Za-z]))/g, "$1 빼기 ")
      .replace(/(^|[\s(])[-−](?=\d)/g, "$1마이너스 ")
      .replace(/\s*<\s*([^\s,.?!]+)/g, " 는 $1 보다 작다")
      .replace(/\s*>\s*([^\s,.?!]+)/g, " 는 $1 보다 크다")
      // 혼자 있는 영어 글자(변수, 점 이름) → 한글 이름
      .replace(/(?<![A-Za-z])([A-Za-z])(?![A-Za-z])/g, (m, ch) => LETTERS[ch.toLowerCase()] || ch)
      .replace(/\s+/g, " ")
      .trim()
  );
}

let koVoice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  koVoice = voices.find((v) => v.lang === "ko-KR" && /yuna|female|여/i.test(v.name)) ||
    voices.find((v) => v.lang?.startsWith("ko")) || null;
}
if (canSpeak) {
  pickVoice();
  speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
}

// 긴 글은 문장 단위로 나눠 읽는다(한 번에 길게 읽으면 중간에 끊기는 폰이 있다).
function splitSentences(text) {
  return text
    .split(/(?<=[.!?。…])\s+|\n+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

let current = null; // 지금 읽는 중인 것 { onEnd }

// text를 읽는다. 다 읽거나 멈추면 onEnd()를 한 번 부른다.
export function speak(text, { onEnd } = {}) {
  if (!canSpeak) return;
  stopSpeaking();
  const parts = splitSentences(mathToSpeech(text));
  if (!parts.length) return onEnd?.();
  const me = { onEnd };
  current = me;
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part);
    u.lang = "ko-KR";
    if (koVoice) u.voice = koVoice;
    u.rate = 1.0;
    if (i === parts.length - 1) {
      u.onend = u.onerror = () => {
        if (current === me) finish();
      };
    }
    speechSynthesis.speak(u);
  });
}

function finish() {
  const done = current;
  current = null;
  done?.onEnd?.();
}

export function stopSpeaking() {
  if (!canSpeak) return;
  speechSynthesis.cancel();
  finish();
}

// 아이폰은 사람이 버튼을 누른 순간에 한 번 말해야 그 뒤 자동 읽기가 된다.
// 보내기/시작 버튼을 누를 때 소리 없는 짧은 말을 한 번 해 둔다.
let unlocked = false;
export function unlockSpeech() {
  if (!canSpeak || unlocked) return;
  unlocked = true;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  speechSynthesis.speak(u);
}
