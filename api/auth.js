// 가입, 로그인, 내 정보(이름, 남은 무료 문제). AI를 부르지 않으므로 비용이 없다.
import { checkAccess, onlyPost, sendError } from "./_lib.js";
import { signup, login, requireUser, creditsOf } from "./_auth.js";
import { HAS_DB } from "./_db.js";

export default async function handler(req, res) {
  if (!onlyPost(req, res) || !checkAccess(req, res)) return;
  const { action, id, password, name } = req.body || {};
  // Vercel에 올렸는데 저장소가 없으면 가입한 아이디가 금방 사라지니 미리 알려 준다.
  if (process.env.VERCEL && !HAS_DB) {
    return res.status(503).json({ error: "저장소가 아직 연결되지 않았어요. Vercel Storage에서 Upstash를 연결해 주세요." });
  }
  try {
    if (action === "signup") return res.json(await signup({ id, password, name }));
    if (action === "login") return res.json(await login({ id, password }));
    const user = await requireUser(req, res);
    if (!user) return;
    res.json({ id: user.id, name: user.name, admin: Boolean(user.admin), credits: await creditsOf(user) });
  } catch (err) {
    sendError(res, err);
  }
}
