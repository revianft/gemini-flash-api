import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "fs/promises";
import { GoogleGenAI } from "@google/genai";

const app = express();
const upload = multer();
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const GEMINI_MODEL = "gemini-2.5-flash";

app.use(express.json());

//GET ENDPOINT TEXT GENERATION
app.get("/generate-text", async (req, res) => {
  const { prompt } = req.body;
  try {
    const response = await ai.generateText({
      model: GEMINI_MODEL,
      content: prompt,
    });

    res.status(200).json({ result: response.text });
  } catch (error) {
    console.error("Error generating text:", error);
    res.status(500).json({ message: error.message });
  }
});

//POST ENDPOINT IMAGE GENERATION
app.post("/generate-image", upload.single("image"), async (req, res) => {
  const { prompt } = req.body;
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        { text: prompt, type: "text" },
        { inlineData: { data: base64Image, mimeType: req.file.mimetype } },
      ],
    });

    res.status(200).json({ result: response.text });
  } catch (error) {
    console.error("Error generating image:", error);
    res.status(500).json({ message: error.message });
  }
});

//POST ENDPOINT GENERATE FROM DOCUMENT
app.post(
  "/generate-from-document",
  upload.single("document"),
  async (req, res) => {
    const { prompt } = req.body;
    const base64document = req.file.buffer.toString("base64");
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          { text: prompt, type: "text" },
          { inlineData: { data: base64document, mimeType: req.file.mimetype } },
        ],
      });

      res.status(200).json({ result: response.text });
    } catch (error) {
      console.error("Error generating from document:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

//POST ENDPOINT GENERATE FROM AUDIO
app.post("/generate-from-audio", upload.single("audio"), async (req, res) => {
  const { prompt } = req.body;
  const base64audio = req.file.buffer.toString("base64");
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        { text: prompt, type: "text" },
        { inlineData: { data: base64audio, mimeType: req.file.mimetype } },
      ],
    });

    res.status(200).json({ result: response.text });
  } catch (error) {
    console.error("Error generating from audio:", error);
    res.status(500).json({ message: error.message });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server ready on http://localhost:3000`));
