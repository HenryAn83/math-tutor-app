// 선생님 말을 Google 음성(Chirp 3 HD)으로 바꿔 mp3로 돌려준다.
// GOOGLE_TTS_KEY 가 없거나 이번 달 글자 수를 다 쓰면 { fallback: true } 를 보내고, 폰은 원래 폰 목소리로 읽는다.
// Google은 한 달 100만 글자까지 무료. 넘으면 돈이 나가니까 TTS_MONTHLY_CHARS(기본 80만)에서 멈춘다.
import { onlyPost } from "./_lib.js";
import { requireUser } from "./_auth.js";
import { redis, today } from "./_db.js";

const KEY = process.env.GOOGLE_TTS_KEY;
export const TTS_ON = Boolean(KEY);
export const TTS_LIMIT = Number(process.env.TTS_MONTHLY_CHARS || 800000);
export const ttsKey = (day = today()) => `tts:month:${day.slice(0, 7)}`;

// 고를 수 있는 목소리(앞쪽 넷은 여자, 뒤쪽 넷은 남자). 첫 번째가 기본.
export const VOICES = ["Aoede", "Kore", "Leda", "Zephyr", "Puck", "Charon", "Fenrir", "Orus"];
const LANGS = { ko: "ko-KR", en: "en-US" };

export default async function handler(req, res) {
  if (!onlyPost(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!KEY) return res.json({ fallback: true });

  const text = String(req.body?.text || "").trim().slice(0, 600);
  const code = LANGS[req.body?.lang] || LANGS.ko;
  const name = VOICES.includes(req.body?.voice) ? req.body.voice : VOICES[0];
  if (!text) return res.status(400).json({ error: "empty" });

  try {
    // 먼저 글자 수를 더해 두고(동시에 많이 와도 한도를 못 넘게), 넘었으면 되돌리고 폰 목소리로.
    const month = ttsKey();
    const used = await redis("INCRBY", month, text.length);
    if (Number(used) > TTS_LIMIT) {
      await redis("INCRBY", month, -text.length);
      return res.json({ fallback: true, reason: "limit" });
    }
    const r = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: code, name: `${code}-Chirp3-HD-${name}` },
        audioConfig: { audioEncoding: "MP3" },
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.audioContent) {
      await redis("INCRBY", month, -text.length);
      console.error("tts error:", r.status, data?.error?.status || "");
      return res.json({ fallback: true, reason: "google" });
    }
    res.json({ audio: data.audioContent });
  } catch (err) {
    console.error("tts error:", err?.name || "");
    res.json({ fallback: true, reason: "network" });
  }
}
