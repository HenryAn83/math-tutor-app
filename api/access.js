// 입장 코드가 맞는지만 확인한다. AI를 부르지 않으므로 비용이 없다.
import { checkAccess, onlyPost } from "./_lib.js";

export default function handler(req, res) {
  if (!onlyPost(req, res) || !checkAccess(req, res)) return;
  res.json({ ok: true });
}
