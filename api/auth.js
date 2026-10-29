// 가입, 로그인, 내 정보(이름, 남은 무료 문제). AI를 부르지 않으므로 비용이 없다.
import { checkAccess, onlyPost, sendError } from "./_lib.js";
import { signup, login, requireUser, creditsOf } from "./_auth.js";

export default async function handler(req, res) {
  if (!onlyPost(req, res) || !checkAccess(req, res)) return;
  const { action, id, password, name } = req.body || {};
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
