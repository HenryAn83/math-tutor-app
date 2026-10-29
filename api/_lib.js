// 서버 공통 도구: Claude 호출, 접근 코드 확인, 정답 암호화.
// 파일 이름이 _ 로 시작하면 Vercel이 주소(API)로 만들지 않는다.
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import { redis, today } from "./_db.js";

export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
export const MOCK = process.env.MOCK === "1";

let client;
function getClient() {
  if (!client) client = new Anthropic(); // ANTHROPIC_API_KEY 환경 변수를 읽는다
  return client;
}

// 비밀 링크(?k=코드)로 들어온 사람만 쓰게 한다. 코드가 설정 안 됐으면 아무도 못 쓴다.
export function checkAccess(req, res) {
  const expected = process.env.ACCESS_CODE;
  const given = req.headers["x-access-code"] || "";
  const ok =
    expected &&
    given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) {
    res.status(401).json({ error: "이 링크로는 들어올 수 없어요. 받은 링크를 다시 열어 주세요." });
    return false;
  }
  return true;
}

export function onlyPost(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return false;
  }
  return true;
}

// 사진, 대화 내용은 어디에도 저장하지 않는다. 오류도 종류만 남긴다.
export function sendError(res, err) {
  if (err?.userFacing) return res.status(400).json({ error: err.message });
  console.error("api error:", err?.status || "", err?.name || "", err?.error?.error?.type || "");
  const busy = err?.status === 429 || err?.status === 529;
  res.status(500).json({
    error: busy
      ? "선생님이 잠깐 바빠요. 10초 뒤에 다시 해 볼래?"
      : "앗, 연결에 문제가 생겼어. 다시 한 번 해 볼래?",
  });
}

function baseRequest({ system, messages, effort, maxTokens }) {
  return {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
    output_config: { effort },
    // 안전 필터가 드물게 막으면 서버가 다른 모델로 자동 재시도
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };
}

// 실제로 쓴 토큰으로 비용을 계산해 오늘·이번 달 합계에 더한다. 단위: 백만분의 1달러.
// 가격($/100만 토큰): 입력, 출력, 캐시 읽기. 모르는 모델이면 비싼 쪽으로 잡는다.
const PRICES = [
  ["claude-haiku", 0.1, 0.5, 0.01],
  ["claude-sonnet", 2, 10, 0.2],
  ["claude-opus-5-5", 4, 20, 0.2],
  ["claude-opus", 5, 25, 0.5],
];

async function recordCost(response) {
  const u = response.usage || {};
  const [, input, output, cacheRead] = PRICES.find(([p]) => String(response.model).startsWith(p)) || [, 10, 50, 1];
  const dollars =
    ((u.input_tokens || 0) * input +
      (u.cache_creation_input_tokens || 0) * input * 1.25 +
      (u.cache_read_input_tokens || 0) * cacheRead +
      (u.output_tokens || 0) * output) /
    1e6;
  const micro = Math.round(dollars * 1e6);
  const day = today();
  await Promise.all([
    redis("INCRBY", `cost:day:${day}`, micro),
    redis("INCRBY", `cost:month:${day.slice(0, 7)}`, micro),
  ]).catch((e) => console.error("cost error:", e.message));
}

function textOf(response) {
  if (response.stop_reason === "refusal") {
    const e = new Error("refusal");
    e.name = "Refusal";
    throw e;
  }
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// 정해진 모양(JSON)으로 답을 받는 호출
export async function askJSON({ system, messages, schema, effort = "medium", maxTokens = 16000 }) {
  const response = await getClient().beta.messages.create({
    ...baseRequest({ system, messages, effort, maxTokens }),
    output_config: { effort, format: { type: "json_schema", schema } },
  });
  await recordCost(response);
  return JSON.parse(textOf(response));
}

// 일반 대화 답을 받는 호출
export async function askText({ system, messages, effort = "medium", maxTokens = 16000 }) {
  const response = await getClient().beta.messages.create(
    baseRequest({ system, messages, effort, maxTokens }),
  );
  await recordCost(response);
  return textOf(response);
}

// 미리 풀어 둔 정답은 아이 폰에 "잠긴 상자"로만 보낸다.
// 서버만 열 수 있어서, 서버에 따로 저장하지 않고도 대화마다 선생님이 정답을 알 수 있다.
function secretKey() {
  const seed = process.env.SECRET_SEED || process.env.ANTHROPIC_API_KEY || "dev-only";
  return crypto.createHash("sha256").update("math-tutor-seal:" + seed).digest();
}

export function seal(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function unseal(token) {
  const buf = Buffer.from(String(token), "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  const data = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
  return JSON.parse(data.toString("utf8"));
}
