// 내 컴퓨터에서 Vercel 없이 돌려 보는 작은 서버. 배포에는 쓰이지 않는다.
// 사용: ANTHROPIC_API_KEY=... ACCESS_CODE=... npm run dev  (또는 npm run dev:mock)
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve("public");
const port = Number(process.env.PORT || 3000);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

// Vercel 함수처럼 res.status().json() 을 쓸 수 있게 해 준다.
function wrap(res) {
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (obj) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
  };
  return res;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const route = url.pathname.match(/^\/api\/([a-z]+)$/);
    if (route) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      try {
        req.body = raw ? JSON.parse(raw) : {};
      } catch {
        req.body = {};
      }
      try {
        const mod = await import(`../api/${route[1]}.js`);
        return mod.default(req, wrap(res));
      } catch {
        res.statusCode = 404;
        return res.end("not found");
      }
    }
    const file = path.join(root, url.pathname === "/" ? "index.html" : url.pathname);
    if (!file.startsWith(root)) return res.writeHead(403).end();
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404).end("not found");
    }
  })
  .listen(port, () => console.log(`http://localhost:${port}/?k=${process.env.ACCESS_CODE || "(ACCESS_CODE 없음)"}`));
