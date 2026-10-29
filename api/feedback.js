// 아이·보호자가 남기는 의견. 관리자 화면에서 본다.
import { checkAccess, onlyPost, sendError } from "./_lib.js";
import { requireUser } from "./_auth.js";
import { pushList } from "./_db.js";
import { say } from "./_i18n.js";

export default async function handler(req, res) {
  if (!onlyPost(req, res) || !checkAccess(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const { rating, text, about, difficulty, questions } = req.body || {};
  const clean = String(text || "").trim().slice(0, 2000);
  const pick = (v, allowed) => (allowed.includes(v) ? v : "");
  const quick = {
    difficulty: pick(difficulty, ["easy", "ok", "hard"]),
    questions: pick(questions, ["many", "ok", "few"]),
  };
  if (!clean && !["up", "down"].includes(rating) && !quick.difficulty && !quick.questions) {
    return res.status(400).json({ error: say(req, "emptyFeedback") });
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
        ...quick,
      },
      1000,
    );
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
}
