// 1단계: 사진을 글로 옮긴다. 사진은 Claude에게 보내기만 하고 저장하지 않는다.
import { askJSON, checkAccess, onlyPost, sendError, MOCK } from "./_lib.js";
import { READ_SYSTEM, READ_SCHEMA } from "./_prompts.js";
import { requireUser, creditsOf, noCredits } from "./_auth.js";

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BASE64 = 4_000_000; // Vercel 요청 한도(4.5MB) 아래

export default async function handler(req, res) {
  if (!onlyPost(req, res) || !checkAccess(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;
  // 사진 읽기는 차감하지 않지만, 남은 문제가 없으면 미리 막는다.
  if ((await creditsOf(user)) === 0) return noCredits(res);
  const { image, mediaType } = req.body || {};
  if (typeof image !== "string" || !TYPES.includes(mediaType) || image.length > MAX_BASE64) {
    return res.status(400).json({ error: "사진을 다시 골라 줄래?" });
  }
  if (MOCK) {
    return res.json({
      problems: [
        {
          text: "그림의 △ABC에서 ∠B = 90°, AB = 6cm, BC = 8cm일 때, 변 AC의 길이를 구하여라.",
          diagram: "직각삼각형 ABC, 직각은 B. AB = 6cm, BC = 8cm",
          unclear_parts: "",
          figure: {
            kind: "geometry",
            points: [
              { name: "A", x: 0, y: 6, label: true },
              { name: "B", x: 0, y: 0, label: true },
              { name: "C", x: 8, y: 0, label: true },
            ],
            segments: [
              { from: "A", to: "B", text: "6cm", dashed: false },
              { from: "B", to: "C", text: "8cm", dashed: false },
              { from: "C", to: "A", text: "", dashed: false },
            ],
            angles: [{ vertex: "B", from: "A", to: "C", text: "", right: true }],
            circles: [],
            axes: { x_min: 0, x_max: 0, y_min: 0, y_max: 0 },
            curves: [],
          },
        },
        {
          text: "일차함수 y = 2x - 1 의 그래프 위의 점 P(2, 3)에 대하여 y절편을 구하여라.",
          diagram: "좌표평면에 직선 y = 2x - 1 과 점 P(2, 3)",
          unclear_parts: "",
          figure: {
            kind: "graph",
            points: [
              { name: "P", x: 2, y: 3, label: true },
              { name: "(0, -1)", x: 0, y: -1, label: false },
            ],
            segments: [],
            angles: [],
            circles: [],
            axes: { x_min: -3, x_max: 4, y_min: -3, y_max: 5 },
            curves: [{ name: "y=2x-1", expr: "2*x-1", x_from: -3, x_to: 4 }],
          },
        },
      ],
      photo_tip: "",
    });
  }
  try {
    const result = await askJSON({
      system: READ_SYSTEM,
      schema: READ_SCHEMA,
      effort: "medium",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: "이 사진의 수학 문제를 옮겨 줘." },
          ],
        },
      ],
    });
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
}
