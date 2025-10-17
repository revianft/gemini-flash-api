import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

// ===== App & SDK setup =====
const app = express();
// Accept GEMINI_API_KEY, GOOGLE_API_KEY or API_KEY
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("Missing GEMINI_API_KEY in environment");
}

const ai = new GoogleGenAI({ apiKey });
const MODEL = "gemini-2.5-flash";

// ===== Parsers & static files =====
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Simple request logger to help debugging origin/route issues
app.use((req, res, next) => {
  console.log(
    new Date().toISOString(),
    req.method,
    req.originalUrl,
    "host=",
    req.headers.host,
    "content-type=",
    req.headers["content-type"]
  );
  next();
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));
app.use("/public", express.static(path.join(__dirname, "public"))); // keep your current URL working

// Multer (in-memory) for uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// helper to base64 inline data
const toB64 = (buf) => Buffer.from(buf).toString("base64");

// ===== Health check =====
app.get("/health", (req, res) => {
  res.json({ ok: true, model: MODEL });
});

// ===== TEXT: POST /generate-text =====
app.post("/generate-text", async (req, res) => {
  try {
    const { prompt } = req.body || {};
    const promptText =
      typeof prompt === "string" && prompt.trim() ? prompt.trim() : "";
    if (!promptText) {
      return res.status(400).json({ message: "'prompt' is required (string)" });
    }

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [promptText],
    });

    const text = response?.text ?? response?.output ?? "";
    return res.status(200).json({ result: text });
  } catch (error) {
    console.error("/generate-text error:", error);
    return res
      .status(500)
      .json({ message: error?.message || "Internal error" });
  }
});

// ===== CHAT: POST /api/chat (multi-turn, remember context) =====
app.post("/api/chat", async (req, res) => {
  try {
    const { conversation, instruction } = req.body || {};

    if (!Array.isArray(conversation) || conversation.length === 0) {
      return res.status(400).json({
        message:
          "Field 'conversation' wajib berupa array dan tidak boleh kosong",
      });
    }

    for (const msg of conversation) {
      if (!msg || typeof msg !== "object") {
        return res
          .status(400)
          .json({ message: "Setiap item conversation harus object" });
      }
      const { role, text } = msg;
      if (!["user", "model"].includes(role)) {
        return res
          .status(400)
          .json({ message: "role harus 'user' atau 'model'" });
      }
      if (typeof text !== "string" || !text.trim()) {
        return res
          .status(400)
          .json({ message: "text harus string dan tidak kosong" });
      }
    }

    const contents = conversation.map(({ role, text }) => ({
      role,
      parts: [{ text }],
    }));

    const systemInstruction =
      typeof instruction === "string" && instruction.trim()
        ? instruction.trim()
        : null;

    const requestPayload = {
      model: MODEL,
      contents,
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 1000,
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        },
      ],
      config: {
        systemInstruction: `Kamu adalah asisten AI yang fun dan friendly. Selalu gunakan bahasa gaul kekinian ala anak Jaksel dengan rules:
          - Mix Bahasa Indonesia dengan English words
          - Sering pakai kata: literally, basically, actually, like, seriously
          - Add kata seru seperti: slay, bestie, guys, gals
          - Gunakan bahasa gaul: gue/gw, lu, kyk, bgt, sih, dong, deh
          - Keep it casual dan fun vibes
          - Tetap helpful dan informatif
          - End chat dengan relevant emojis
          - Kalau ngasih code tetap professional
          - terdenger seperti gadis muda gen z gaul yang asik dan friendly`,
      },
    };

    const response = await ai.models.generateContent(requestPayload);
    const text = response?.text ?? response?.output ?? "";

    return res.status(200).json({ result: text });
  } catch (error) {
    console.error("/api/chat error:", error);
    return res
      .status(500)
      .json({ message: error?.message || "Internal error" });
  }
});

// ===== VISION: POST /generate-image (prompt + image) =====
app.post("/generate-image", upload.single("image"), async (req, res) => {
  try {
    const { prompt } = req.body || {};
    const file = req.file;
    if (!file)
      return res.status(400).json({ message: "'image' file is required" });

    const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowed.includes(file.mimetype)) {
      return res
        .status(415)
        .json({ message: `Unsupported image type: ${file.mimetype}` });
    }

    const promptText =
      typeof prompt === "string" && prompt.trim() ? prompt.trim() : "";
    const contents = [
      ...(promptText ? [promptText] : []),
      { inlineData: { data: toB64(file.buffer), mimeType: file.mimetype } },
    ];

    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
    });

    const text = response?.text ?? response?.output ?? "";
    return res.status(200).json({ result: text });
  } catch (error) {
    console.error("/generate-image error:", error);
    return res
      .status(500)
      .json({ message: error?.message || "Internal error" });
  }
});

// ===== DOCUMENT: POST /generate-from-document (prompt + document) =====
app.post(
  "/generate-from-document",
  upload.single("document"),
  async (req, res) => {
    try {
      const { prompt } = req.body || {};
      const file = req.file;
      if (!file)
        return res.status(400).json({ message: "Document file is required." });

      const allowedDocs = [
        "application/pdf",
        "text/plain",
        "text/markdown",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      if (!allowedDocs.includes(file.mimetype)) {
        return res.status(415).json({
          message: `Unsupported document type: ${file.mimetype}`,
        });
      }

      const promptText =
        typeof prompt === "string" && prompt.trim() ? prompt.trim() : "";
      const base64 = toB64(file.buffer);
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [
          ...(promptText ? [promptText] : []),
          { inlineData: { data: base64, mimeType: file.mimetype } },
        ],
      });

      const text = response?.text ?? response?.output ?? "";
      return res.status(200).json({ result: text });
    } catch (error) {
      console.error("/generate-from-document error:", error);
      return res
        .status(500)
        .json({ message: error?.message || "Internal error" });
    }
  }
);

// ===== AUDIO: POST /generate-from-audio (prompt + audio) =====
app.post("/generate-from-audio", upload.single("audio"), async (req, res) => {
  try {
    const { prompt } = req.body || {};
    const file = req.file;
    if (!file)
      return res.status(400).json({ message: "Audio file is required." });

    const allowedAudio = [
      "audio/webm",
      "audio/wav",
      "audio/mpeg",
      "audio/mp4",
      "audio/ogg",
      "audio/opus",
    ];
    if (!allowedAudio.includes(file.mimetype)) {
      return res.status(415).json({
        message: `Unsupported audio type: ${file.mimetype}`,
      });
    }

    const promptText =
      typeof prompt === "string" && prompt.trim() ? prompt.trim() : "";
    const base64 = toB64(file.buffer);
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        ...(promptText ? [promptText] : []),
        { inlineData: { data: base64, mimeType: file.mimetype } },
      ],
    });

    const text = response?.text ?? response?.output ?? "";
    return res.status(200).json({ result: text });
  } catch (error) {
    console.error("/generate-from-audio error:", error);
    return res
      .status(500)
      .json({ message: error?.message || "Internal error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server ready on http://localhost:${PORT}`);
});
