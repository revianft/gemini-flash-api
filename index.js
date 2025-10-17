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
if (!apiKey)
  throw new Error(
    "Missing GEMINI_API_KEY or GOOGLE_API_KEY or API_KEY in .env"
  );

const ai = new GoogleGenAI({ apiKey });
const MODEL = process.env.MODEL || "gemini-2.5-flash";

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
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ message: "'prompt' is required (string)" });
    }

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
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

// ===== VISION: POST /generate-image (prompt + image) =====
app.post("/generate-image", upload.single("image"), async (req, res) => {
  try {
    const { prompt } = req.body || {};
    const file = req.file;
    if (!prompt)
      return res.status(400).json({ message: "'prompt' is required" });
    if (!file)
      return res.status(400).json({ message: "'image' file is required" });

    const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowed.includes(file.mimetype)) {
      return res
        .status(415)
        .json({ message: `Unsupported image type: ${file.mimetype}` });
    }

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        prompt,
        { inlineData: { data: toB64(file.buffer), mimeType: file.mimetype } },
      ],
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
      if (!prompt)
        return res.status(400).json({ message: "Prompt is required." });
      if (!file)
        return res.status(400).json({ message: "Document file is required." });

      const base64 = toB64(file.buffer);
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [
          prompt,
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
    if (!prompt)
      return res.status(400).json({ message: "Prompt is required." });
    if (!file)
      return res.status(400).json({ message: "Audio file is required." });

    const base64 = toB64(file.buffer);
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        prompt,
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
