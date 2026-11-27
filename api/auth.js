// 가입, 로그인, 내 정보(이름, 남은 무료 문제). AI를 부르지 않으므로 비용이 없다.
import { signupAllowed, countSignup, onlyPost, sendError } from "./_lib.js";
import { signup, login, creditsOf, userFromToken, makeToken, setLoginCookie, loginCookie, bearer } from "./_auth.js";
import { HAS_DB } from "./_db.js";
import { say } from "./_i18n.js";

export default async function handler(req, res) {
  if (!onlyPost(req, res)) return;
  const { action, id, password, name } = req.body || {};
  // Vercel에 올렸는데 저장소가 없으면 가입한 아이디가 금방 사라지니 미리 알려 준다.
  if (process.env.VERCEL && !HAS_DB) {
    return res.status(503).json({ error: say(req, "noDb") });
  }
  try {
    if (action === "signup") {
      // 초대 코드 없이 누구나 가입. 옛 초대 링크(?k=)로 와도 코드는 그냥 무시한다.
      if (!(await signupAllowed(req))) return res.status(429).json({ error: say(req, "tooManySignups") });
      const result = await signup({ id, password, name });
      await countSignup(req);
      setLoginCookie(res, result.token);
      return res.json(result);
    }
    if (action === "login") {
      const result = await login({ id, password });
      setLoginCookie(res, result.token);
      return res.json(result);
    }
    if (action === "logout") {
      setLoginCookie(res, "");
      return res.json({ ok: true });
    }
    // 내 정보. 폰에 표가 없으면 쿠키로 확인한다. 들어올 때마다 표를 새로 만들어 주므로
    // 180일 안에 한 번이라도 열면 로그인이 계속 유지된다.
    const user = (await userFromToken(bearer(req))) || (await userFromToken(loginCookie(req)));
    if (!user) {
      setLoginCookie(res, "");
      return res.status(401).json({ error: say(req, "relogin"), login: true });
    }
    const token = makeToken(user);
    setLoginCookie(res, token);
    res.json({ id: user.id, name: user.name, admin: Boolean(user.admin), credits: await creditsOf(user), token });
  } catch (err) {
    sendError(res, err);
  }
}
