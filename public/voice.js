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
export function mathToSpeech(text) {
  return (
    text
      // 이모지 빼기
      .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
      // 분수 a/b → b분의 a
      .replace(/(\(?[\w.²³]+\)?)\s*\/\s*(\(?[\w.²³]+\)?)/g, "$2분의 $1")
      .replace(/²/g, " 제곱")
      .replace(/³/g, " 세제곱")
      .replace(/√\s*\(([^)]*)\)/g, "루트 $1")
      .replace(/√/g, "루트 ")
      .replace(/×/g, " 곱하기 ")
      .replace(/÷/g, " 나누기 ")
      .replace(/≤/g, " 작거나 같다 ")
      .replace(/≥/g, " 크거나 같다 ")
      .replace(/≠/g, " 같지 않다 ")
      .replace(/π/g, "파이")
      .replace(/∠/g, "각 ")
      .replace(/△/g, "삼각형 ")
      .replace(/∥/g, " 평행 ")
      .replace(/⊥/g, " 수직 ")
      .replace(/°/g, "도")
      .replace(/\s=\s|=/g, " 는 ")
      .replace(/\s\+\s|\+/g, " 더하기 ")
      // 빼기/음수: 숫자나 글자 사이의 - 만 바꾼다(문장 속 하이픈은 그대로)
      .replace(/([\w)²³])\s+[-−]\s+(?=[\w(√])/g, "$1 빼기 ")
      .replace(/([\d)²³])[-−](?=[\w(√])|([\w)])[-−](?=\d)/g, (m, a, b) => `${a ?? b} 빼기 `)
      .replace(/(?<![A-Za-z])([A-Za-z])[-−](?=[A-Za-z](?![A-Za-z]))/g, "$1 빼기 ")
      .replace(/(^|[\s(])[-−](?=\d)/g, "$1마이너스 ")
      .replace(/</g, " 작다 ")
      .replace(/>/g, " 크다 ")
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

export function speak(text) {
  if (!canSpeak) return;
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(mathToSpeech(text));
  u.lang = "ko-KR";
  if (koVoice) u.voice = koVoice;
  u.rate = 1.0;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel();
}
