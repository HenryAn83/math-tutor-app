// 계정·남은 횟수·피드백·통계를 담는 작은 저장소 (Upstash Redis, Vercel Storage에서 무료로 연결).
// 연결 정보가 없으면(내 컴퓨터 테스트) 메모리에만 담고, 서버를 끄면 사라진다.
// 사진과 대화 원문은 여기에 저장하지 않는다.

const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const HAS_DB = Boolean(URL && TOKEN);

// redis("GET", "key") 처럼 Redis 명령을 그대로 보낸다.
export async function redis(...command) {
  if (!HAS_DB) return memory(command.map(String));
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command.map(String)),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error("db: " + (data.error || res.status));
  return data.result;
}

export async function getJSON(key) {
  const raw = await redis("GET", key);
  return raw ? JSON.parse(raw) : null;
}

export function setJSON(key, value, ...options) {
  return redis("SET", key, JSON.stringify(value), ...options);
}

// 목록 맨 앞에 넣고, 오래된 것은 limit 개수까지만 남긴다.
export async function pushList(key, value, limit) {
  await redis("LPUSH", key, JSON.stringify(value));
  await redis("LTRIM", key, 0, limit - 1);
}

export async function readList(key, count) {
  const rows = (await redis("LRANGE", key, 0, count - 1)) || [];
  return rows.map((r) => JSON.parse(r));
}

// 하루·한 달 기준은 헨리가 사는 미국 중부 시간으로 센다.
export function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); // 2026-10-29
}

// ---------- 테스트용 메모리 저장소 ----------

const mem = new Map();

function memory([cmd, key, ...args]) {
  const op = cmd.toUpperCase();
  const list = () => mem.get(key) || [];
  switch (op) {
    case "GET":
      return mem.get(key) ?? null;
    case "MGET":
      return [key, ...args].map((k) => mem.get(k) ?? null);
    case "SET": {
      const flags = args.slice(1).map((a) => a.toUpperCase());
      if (flags.includes("NX") && mem.has(key)) return null;
      mem.set(key, args[0]);
      return "OK";
    }
    case "EXPIRE":
      return 1; // 메모리 저장소는 서버를 끄면 어차피 사라진다
    case "DEL":
      return Number(mem.delete(key));
    case "INCRBY":
    case "DECRBY": {
      const n = Number(mem.get(key) || 0) + (op === "INCRBY" ? 1 : -1) * Number(args[0]);
      mem.set(key, String(n));
      return n;
    }
    case "SADD": {
      const s = mem.get(key) || new Set();
      args.forEach((a) => s.add(a));
      mem.set(key, s);
      return args.length;
    }
    case "SMEMBERS":
      return [...(mem.get(key) || [])];
    case "LPUSH":
      mem.set(key, [...args.reverse(), ...list()]);
      return list().length;
    case "LTRIM":
      mem.set(key, list().slice(Number(args[0]), Number(args[1]) + 1));
      return "OK";
    case "LRANGE": {
      const end = Number(args[1]);
      return list().slice(Number(args[0]), end < 0 ? undefined : end + 1);
    }
    default:
      throw new Error("memory db: " + op);
  }
}
