// 아이·보호자가 남기는 의견. 관리자 화면에서 본다.
import { checkAccess, onlyPost, sendError } from "./_lib.js";
import { requireUser } from "./_auth.js";
import { pushList } from "./_db.js";

export default async function handler(req, res) {
  if (!onlyPost(req, res) || !checkAccess(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const { rating, text, about } = req.body || {};
  const clean = String(text || "").trim().slice(0, 2000);
  if (!clean && !["up", "down"].includes(rating)) {
    return res.status(400).json({ error: "한 줄이라도 적어 줄래?" });
  }
  try {
    await pushList(
      "feedback",
      {
        user: user.id,
        name: user.name,
        at: Date.now(),
        rating: ["up", "down"].includes(rating) ? rating : "",
        text: clean,
        about: String(about || "").slice(0, 100),
      },
      1000,
    );
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
}
