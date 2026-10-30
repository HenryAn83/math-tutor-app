// 음성 기능: 브라우저에 들어 있는 무료 기능만 쓴다(서버, 비용 없음).
// 🎤 말하기 → 글자로 바꿔 입력칸에 넣기 / 🔊 선생님 말 읽어 주기

import { lang, t, SPEECH } from "./i18n.js";

const SPEECH_LANG = SPEECH[lang];
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
  recognizer.lang = SPEECH_LANG;
  recognizer.interimResults = true;
  recognizer.continuous = false;
  recognizer.onresult = (e) => {
    const text = [...e.results].map((r) => r[0].transcript).join("");
    onText(text, e.results[e.results.length - 1].isFinal);
  };
  recognizer.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      onError(t("voice.denied"));
    } else if (e.error === "no-speech") {
      onError(t("voice.silent"));
    } else if (e.error !== "aborted") {
      onError(t("voice.failed"));
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
  if (lang === "en") return mathToSpeechEn(text);
  return (
    text
      // 이모지, 그림 짚기 표시(⟦ ⟧), 꾸밈 글자(** # `) 빼기
      .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}⟦⟧*#`]/gu, "")
      // "음~" "그렇지~~" 의 물결은 길게 끄는 말이라 쉼표로(안 그러면 "물결"이라고 읽는 폰이 있다)
      .replace(/~+/g, ",")
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

// 영어 수식 읽기. 예: "x² + 3/4 = 1" → "x squared plus 3 over 4 equals 1"
// 글자 하나(x, y, A)는 영어 음성이 알아서 잘 읽으니 그대로 둔다.
function mathToSpeechEn(text) {
  return text
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}⟦⟧*#`]/gu, "")
    .replace(/~+/g, ",")
    .replace(/(\(?[\w.²³]+\)?)\s*\/\s*(\(?[\w.²³]+\)?)/g, "$1 over $2")
    .replace(/\^\s*2(?!\d)/g, "²")
    .replace(/\^\s*3(?!\d)/g, "³")
    .replace(/\^\s*(\d+)/g, " to the power of $1")
    .replace(/[⁴⁵⁶⁷⁸⁹]/g, (c) => ` to the power of ${"⁴⁵⁶⁷⁸⁹".indexOf(c) + 4}`)
    .replace(/²/g, " squared")
    .replace(/³/g, " cubed")
    .replace(/√\s*\(([^)]*)\)/g, "the square root of $1")
    .replace(/√/g, "the square root of ")
    .replace(/×/g, " times ")
    .replace(/÷/g, " divided by ")
    .replace(/≤/g, " is less than or equal to ")
    .replace(/≥/g, " is greater than or equal to ")
    .replace(/≠/g, " is not equal to ")
    .replace(/π/g, "pi")
    .replace(/∠/g, "angle ")
    .replace(/△/g, "triangle ")
    .replace(/∥/g, " is parallel to ")
    .replace(/⊥/g, " is perpendicular to ")
    .replace(/°/g, " degrees")
    .replace(/%/g, " percent")
    .replace(/∴/g, "so ")
    .replace(/→/g, ", ")
    .replace(/[·•]/g, " ")
    .replace(/\s=\s|=/g, " equals ")
    .replace(/\s\+\s|\+/g, " plus ")
    .replace(/([\w)²³]|squared|cubed)\s+[-−]\s+(?=[\w(√])/g, "$1 minus ")
    .replace(/([\d)²³])[-−](?=[\w(√])|([\w)])[-−](?=\d)/g, (m, a, b) => `${a ?? b} minus `)
    .replace(/(^|[\s(])[-−](?=\d)/g, "$1negative ")
    .replace(/\s<\s/g, " is less than ")
    .replace(/\s>\s/g, " is greater than ")
    // 글자 a는 "uh"로 읽혀서 "A"로
    .replace(/(?<![A-Za-z'])a(?![A-Za-z'])(?=\s*(?:[-−+=×÷²³)]|squared|plus|minus|equals|times|over))/g, "A")
    .replace(/\s+/g, " ")
    .trim();
}

// 폰/브라우저마다 들어 있는 목소리가 다르다. 사람 같은 목소리에 점수를 많이 줘서 가장 좋은 걸 고른다.
// - 아이폰: "Yuna (향상됨/프리미엄)", "Ava (Premium)" 처럼 받아 둔 고품질 목소리
// - 엣지: "Microsoft SunHi Online (Natural)" 같은 자연스러운 목소리
// - 크롬/안드로이드: "Google 한국의", 삼성 목소리
// 장난감 같은 목소리(Bubbles, Zarvox 등)와 옛날 기계 목소리(Fred 등)는 빼 버린다.
const ROBOTIC =
  /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|eddy|flo\b|reed|rocko|sandy|shelley|espeak/i;
const NICE = {
  ko: /yuna|유나|sunhi|선희|sora|소라|jimin|seoyeon|서연|hyunsu/i,
  en: /ava|samantha|zoe|allison|susan|aria|jenny|emma|michelle|ana\b|serena|nicky|google us/i,
};

function score(v) {
  const name = v.name || "";
  const vlang = (v.lang || "").replace("_", "-");
  if (!vlang.toLowerCase().startsWith(SPEECH_LANG.split("-")[0])) return -1;
  if (ROBOTIC.test(name)) return -1;
  let s = 0;
  if (vlang === SPEECH_LANG) s += 10;
  if (/natural|neural|online/i.test(name)) s += 100;
  if (/premium|프리미엄/i.test(name)) s += 90;
  if (/enhanced|향상/i.test(name)) s += 70;
  if (/google/i.test(name)) s += 50;
  if (/samsung|삼성/i.test(name)) s += 40;
  if (v.localService === false) s += 20; // 인터넷으로 만드는 목소리가 보통 더 자연스럽다
  if (NICE[lang]?.test(name)) s += 15;
  if (v.default) s += 5;
  return s;
}

// 좋은 순서대로 쓸 수 있는 목소리 목록
let ranked = [];
let voice = null;
const VOICE_KEY = "voiceName_" + lang;

function pickVoice() {
  ranked = speechSynthesis
    .getVoices()
    .map((v) => ({ v, s: score(v) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.v);
  let saved = null;
  try {
    saved = localStorage.getItem(VOICE_KEY);
  } catch {}
  voice = ranked.find((v) => v.name === saved) || ranked[0] || null;
}
if (canSpeak) {
  pickVoice();
  speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
}

// ---------- Google 목소리 (서버에 GOOGLE_TTS_KEY 가 있을 때만) ----------
// 문장마다 서버(/api/tts)에서 mp3를 받아 재생한다. 안 되면(키 없음, 한도 다 씀, 인터넷 문제) 폰 목소리로 읽는다.

const CLOUD_VOICES = ["Aoede", "Kore", "Leda", "Zephyr", "Puck", "Charon", "Fenrir", "Orus"]; // 앞 넷 여자, 뒤 넷 남자
const CLOUD_KEY = "cloudVoice";
let cloudOff = false; // 서버가 "폰 목소리로 해"라고 하면 이 화면에선 다시 묻지 않는다
let cloudWorks = false; // 한 번이라도 Google 목소리가 나왔는지
let cloudVoice = CLOUD_VOICES[0];
try {
  if (CLOUD_VOICES.includes(localStorage.getItem(CLOUD_KEY))) cloudVoice = localStorage.getItem(CLOUD_KEY);
} catch {}
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let ctx = null;
const cache = new Map(); // 같은 문장은 다시 받지 않는다(다시 듣기는 0원)

function authToken() {
  try {
    return localStorage.getItem("authToken");
  } catch {
    return null;
  }
}

function useCloud() {
  return !cloudOff && !!AudioCtx && !!authToken();
}

function fetchAudio(text) {
  const key = `${cloudVoice}|${text}`;
  if (!cache.has(key)) {
    const job = fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ text, lang, voice: cloudVoice }),
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => {
        if (d.fallback) cloudOff = true;
        if (!d.audio) return null;
        const bytes = Uint8Array.from(atob(d.audio), (c) => c.charCodeAt(0));
        return ctx.decodeAudioData(bytes.buffer);
      })
      .catch(() => null);
    job.then((b) => {
      if (b) cloudWorks = true;
      else cache.delete(key);
    });
    cache.set(key, job);
    if (cache.size > 80) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}

function playBuffer(buf, me) {
  return new Promise((resolve) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = resolve;
    me.source = src;
    src.start();
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function speakCloud(parts, me, onPart) {
  ctx ||= new AudioCtx();
  if (ctx.state !== "running") await ctx.resume().catch(() => {});
  // 소리가 아직 잠겨 있으면(아이폰에서 버튼을 안 누른 경우) 폰 목소리로
  if (ctx.state !== "running") return speakBrowser(parts, me, onPart);
  const jobs = parts.map((p) => fetchAudio(p.spoken)); // 모든 문장을 한꺼번에 미리 받아 둔다
  for (let i = 0; i < parts.length; i++) {
    const buf = await jobs[i];
    if (current !== me) return;
    if (!buf) return speakBrowser(parts.slice(i), me, onPart);
    onPart?.(parts[i].raw);
    await playBuffer(buf, me);
    if (current !== me) return;
    if (parts[i].pause) await wait(300);
    if (current !== me) return;
  }
  finish();
}

// 🗣 버튼: 다음 목소리로 바꾸고 이름을 돌려준다(맘에 드는 목소리를 아이가 고를 수 있게).
export function voiceCount() {
  return cloudWorks && !cloudOff ? CLOUD_VOICES.length : ranked.length;
}
export function nextVoice() {
  if (cloudWorks && !cloudOff) {
    const i = CLOUD_VOICES.indexOf(cloudVoice);
    cloudVoice = CLOUD_VOICES[(i + 1) % CLOUD_VOICES.length];
    try {
      localStorage.setItem(CLOUD_KEY, cloudVoice);
    } catch {}
    return cloudVoice;
  }
  if (!ranked.length) pickVoice();
  if (!ranked.length) return null;
  const i = ranked.indexOf(voice);
  voice = ranked[(i + 1) % ranked.length];
  try {
    localStorage.setItem(VOICE_KEY, voice.name);
  } catch {}
  return voice.name.replace(/\s*\(.*?\)\s*/g, " ").replace(/^Microsoft |^Google /, "").trim();
}

// 긴 글은 문장 단위로 나눠 읽는다(한 번에 길게 읽으면 중간에 끊기는 폰이 있다).
function splitSentences(text) {
  return text
    .split(/(?<=[.!?。…])\s+|\n+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

let current = null; // 지금 읽는 중인 것 { onEnd, source }

// 핵심설명은 조금 천천히, 조금 높게 읽고 앞에 "핵심 설명!"을 붙인다.
// 브라우저 기본 음성은 감정 어투를 못 바꾸고 속도와 높낮이만 바꿀 수 있다.
// 높낮이를 많이 올리면 기계 소리처럼 들려서 살짝만 바꾼다. 평소엔 조금 천천히, 또박또박.
const NORMAL = { rate: 0.95, pitch: 1.02 };
const EMPHASIS = { rate: 0.85, pitch: 1.06 };
const TITLE = { rate: 0.9, pitch: 1.1 };

// text(글 하나, 또는 [{ text, emphasis }] 목록)를 읽는다. 다 읽거나 멈추면 onEnd()를 한 번 부른다.
// onPart(원래 문장)는 문장마다 읽기 시작할 때 불린다(그림 깜빡임을 말과 맞추려고).
export function speak(text, { onEnd, onPart } = {}) {
  if (!canSpeak) return;
  stopSpeaking();
  const segments = typeof text === "string" ? [{ text }] : text;
  const parts = [];
  for (const seg of segments) {
    if (seg.emphasis) parts.push({ spoken: t("chat.keySpoken"), raw: "", voice: TITLE, pause: true });
    for (const raw of splitSentences(seg.text)) {
      const spoken = mathToSpeech(raw);
      if (spoken) parts.push({ spoken, raw, voice: seg.emphasis ? EMPHASIS : NORMAL });
    }
  }
  if (!parts.length) return onEnd?.();
  const me = { onEnd };
  current = me;
  if (useCloud()) speakCloud(parts, me, onPart);
  else speakBrowser(parts, me, onPart);
}

function speakBrowser(parts, me, onPart) {
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part.spoken);
    u.lang = SPEECH_LANG;
    if (voice) u.voice = voice;
    u.rate = part.voice.rate;
    u.pitch = part.voice.pitch;
    u.onstart = () => {
      if (current === me) onPart?.(part.raw);
    };
    if (i === parts.length - 1) {
      u.onend = u.onerror = () => {
        if (current === me) finish();
      };
    }
    speechSynthesis.speak(u);
    // 제목 뒤에 잠깐 쉬기(소리 없는 짧은 말)
    if (part.pause) {
      const gap = new SpeechSynthesisUtterance(" ");
      gap.volume = 0;
      gap.lang = SPEECH_LANG;
      speechSynthesis.speak(gap);
    }
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
  try {
    current?.source?.stop();
  } catch {}
  finish();
}

// 아이폰은 사람이 버튼을 누른 순간에 한 번 소리를 내야 그 뒤 자동 읽기가 된다.
// 보내기/시작 버튼을 누를 때 소리 없는 짧은 말을 한 번 해 두고, Google 목소리용 소리 장치도 연다.
let unlocked = false;
export function unlockSpeech() {
  if (AudioCtx) {
    try {
      // 아이폰 무음 모드에서도 소리가 나게(지원하는 폰만)
      if (navigator.audioSession) navigator.audioSession.type = "playback";
      ctx ||= new AudioCtx();
      if (ctx.state !== "running") ctx.resume().catch(() => {});
    } catch {}
  }
  if (!canSpeak || unlocked) return;
  unlocked = true;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  speechSynthesis.speak(u);
}
