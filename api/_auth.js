// 아이디·비밀번호 로그인과 남은 무료 문제 수.
// 테스트 단계라 아이디, 비밀번호, 이름만 받는다(이메일, 나이 등은 받지 않음).
// 마스터(관리자) 계정은 Vercel 환경 변수 MASTER_ID, MASTER_PASSWORD로 정한다.
import crypto from "node:crypto";
import { redis, getJSON, setJSON } from "./_db.js";

export const FREE_CREDITS = Number(process.env.FREE_CREDITS || 5);
const MASTER = "@master"; // 일반 아이디로는 만들 수 없는 이름
const TOKEN_DAYS = 180;

const userKey = (id) => `user:${id}`;
export const creditKey = (id) => `credits:${id}`;
export const usedKey = (id) => `used:${id}`;

export function cleanId(id) {
  return String(id || "").trim().toLowerCase();
}

function same(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function checkPassword(password, stored) {
  const [salt] = String(stored).split(":");
  return same(hashPassword(password, salt), stored);
}

// 로그인 표: 폰이 들고 있다가 매번 같이 보낸다. 서버 비밀값으로 서명해서 위조할 수 없다.
function tokenKey() {
  const seed = process.env.SECRET_SEED || process.env.ANTHROPIC_API_KEY || "dev-only";
  return crypto.createHash("sha256").update("math-tutor-login:" + seed).digest();
}

function sign(body) {
  return crypto.createHmac("sha256", tokenKey()).update(body).digest("base64url");
}

function makeToken(user) {
  const body = Buffer.from(
    JSON.stringify({ u: user.id, v: user.pv || 0, exp: Date.now() + TOKEN_DAYS * 864e5 }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

function readToken(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig || !same(sign(body), sig)) return null;
  const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  return data.exp > Date.now() ? data : null;
}

const masterUser = () => ({ id: MASTER, name: "관리자", admin: true, unlimited: true });

export async function signup({ id, password, name }) {
  id = cleanId(id);
  name = String(name || "").trim();
  if (!/^[a-z0-9_]{3,20}$/.test(id)) throw userError("아이디는 영어 소문자, 숫자, _ 로 3~20자로 만들어 줘.");
  if (cleanId(process.env.MASTER_ID) === id) throw userError("이 아이디는 쓸 수 없어. 다른 걸로 해 줘.");
  if (String(password || "").length < 4) throw userError("비밀번호는 4자 이상으로 해 줘.");
  if (!name || name.length > 20) throw userError("이름을 20자 안으로 적어 줘.");
  const user = { id, name, pass: hashPassword(password), pv: 0, unlimited: false, disabled: false, createdAt: Date.now() };
  if ((await setJSON(userKey(id), user, "NX")) !== "OK") throw userError("이미 있는 아이디야. 다른 걸로 해 줘.");
  await redis("SADD", "users", id);
  await redis("SET", creditKey(id), FREE_CREDITS);
  return { token: makeToken(user) };
}

export async function login({ id, password }) {
  id = cleanId(id);
  const masterId = cleanId(process.env.MASTER_ID);
  if (masterId && process.env.MASTER_PASSWORD && id === masterId) {
    if (!same(password, process.env.MASTER_PASSWORD)) throw userError("아이디나 비밀번호가 맞지 않아.");
    return { token: makeToken(masterUser()) };
  }
  const user = id ? await getJSON(userKey(id)) : null;
  if (!user || !checkPassword(password, user.pass)) throw userError("아이디나 비밀번호가 맞지 않아.");
  if (user.disabled) throw userError("이 계정은 지금 쓸 수 없어. 관리자에게 물어봐 줘.");
  return { token: makeToken(user) };
}

// 요청에 붙은 로그인 표를 확인한다. 안 되면 401을 보내고 null을 돌려준다.
export async function requireUser(req, res) {
  const token = String(req.headers.authorization || "").replace(/^Bearer /, "");
  let data = null;
  try {
    data = readToken(token);
  } catch {}
  let user = null;
  if (data?.u === MASTER) user = masterUser();
  else if (data) {
    const stored = await getJSON(userKey(data.u));
    if (stored && !stored.disabled && (stored.pv || 0) === data.v) user = stored;
  }
  if (!user) {
    res.status(401).json({ error: "다시 로그인해 줘.", login: true });
    return null;
  }
  return user;
}

export async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (user && !user.admin) {
    res.status(403).json({ error: "관리자만 볼 수 있어." });
    return null;
  }
  return user;
}

export async function creditsOf(user) {
  if (user.unlimited) return null; // 무제한
  return Number((await redis("GET", creditKey(user.id))) || 0);
}

// 문제 하나를 시작할 때 1회 차감. 남은 게 없으면 false.
export async function useCredit(user) {
  if (user.unlimited) return true;
  const left = await redis("DECRBY", creditKey(user.id), 1);
  if (left < 0) {
    await redis("INCRBY", creditKey(user.id), 1);
    return false;
  }
  return true;
}

// 선생님 쪽 오류로 문제를 못 시작했으면 돌려준다.
export async function refundCredit(user) {
  if (!user.unlimited) await redis("INCRBY", creditKey(user.id), 1);
}

export async function countUse(user) {
  if (!user.admin) await redis("INCRBY", usedKey(user.id), 1);
}

export function noCredits(res) {
  res.status(402).json({ error: "무료 문제를 다 썼어. 더 풀고 싶으면 '의견 보내기'로 알려 줘!", noCredits: true });
}

// ---------- 관리자용 ----------

export async function listUsers() {
  const ids = (await redis("SMEMBERS", "users")) || [];
  if (!ids.length) return [];
  const [users, credits, used] = await Promise.all([
    redis("MGET", ...ids.map(userKey)),
    redis("MGET", ...ids.map(creditKey)),
    redis("MGET", ...ids.map(usedKey)),
  ]);
  return ids
    .map((id, i) => {
      if (!users[i]) return null;
      const { pass, pv, ...u } = JSON.parse(users[i]);
      return { ...u, credits: Number(credits[i] || 0), used: Number(used[i] || 0) };
    })
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateUser(id, { addCredits, unlimited, disabled, newPassword }) {
  id = cleanId(id);
  const user = await getJSON(userKey(id));
  if (!user) throw userError("그런 사용자가 없어요.");
  if (addCredits) {
    const n = Math.trunc(Number(addCredits));
    if (!Number.isFinite(n) || Math.abs(n) > 1000) throw userError("횟수를 다시 확인해 주세요.");
    const left = await redis("INCRBY", creditKey(id), n);
    if (left < 0) await redis("SET", creditKey(id), 0);
  }
  if (typeof unlimited === "boolean") user.unlimited = unlimited;
  if (typeof disabled === "boolean") user.disabled = disabled;
  if (newPassword) {
    if (String(newPassword).length < 4) throw userError("비밀번호는 4자 이상으로 해 주세요.");
    user.pass = hashPassword(newPassword);
    user.pv = (user.pv || 0) + 1; // 예전 로그인은 풀린다
  }
  await setJSON(userKey(id), user);
}

export function userError(message) {
  const e = new Error(message);
  e.userFacing = true;
  return e;
}
