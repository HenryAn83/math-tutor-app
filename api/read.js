// 1단계: 사진을 글로 옮긴다. 사진은 Claude에게 보내기만 하고 저장하지 않는다.
import { askJSON, checkAccess, onlyPost, sendError, MOCK } from "./_lib.js";
import { READ_SYSTEM, READ_SCHEMA } from "./_prompts.js";

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BASE64 = 4_000_000; // Vercel 요청 한도(4.5MB) 아래

export default async function handler(req, res) {
  if (!onlyPost(req, res) || !checkAccess(req, res)) return;
  const { image, mediaType } = req.body || {};
  if (typeof image !== "string" || !TYPES.includes(mediaType) || image.length > MAX_BASE64) {
    return res.status(400).json({ error: "사진을 다시 골라 줄래?" });
  }
  if (MOCK) {
    return res.json({
      problems: [{ text: "일차방정식 3(x - 2) = 2x + 5 를 풀어라.", diagram: "", unclear_parts: "" }],
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
