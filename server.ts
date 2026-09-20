import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // Initialize Gemini AI securely using server-side keys
  const apiKey = process.env.GEMINI_API_KEY;
  let ai: GoogleGenAI | null = null;
  if (apiKey) {
    ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  // API Endpoint to process "Hỏi AI" (Gemini Integration)
  app.post("/api/gemini/chat", async (req, res) => {
    try {
      const { prompt, history, userName } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: "Missing prompt" });
      }

      if (!ai) {
        return res.status(503).json({
          error: "Gemini API key is not configured in the workspace secrets. Please add it via Settings > Secrets.",
        });
      }

      const systemInstruction = `Bạn là Trợ lý AI tích hợp trong ứng dụng Zalo Chat của người dùng tên là ${userName || "người dùng"}. 
Hãy trả lời hoàn toàn bằng tiếng Việt tự nhiên, thân thiện, mang phong cách Zalo, ngắn gọn, súc tích và thiết thực. 
Hãy xưng hô trịnh trọng hoặc thân mật tùy hoàn cảnh (như 'mình', 'bạn', 'Zalo AI').`;

      const contents = [];
      if (history && Array.isArray(history)) {
        for (const msg of history) {
          contents.push({
            role: msg.role === "user" ? "user" : "model",
            parts: [{ text: msg.text }],
          });
        }
      }
      contents.push({
        role: "user",
        parts: [{ text: prompt }],
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      const answer = response.text || "Xin lỗi, tôi không thể xử lý yêu cầu lúc này.";
      res.json({ answer });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({
        error: error.message || "An error occurred while communicating with the AI service.",
      });
    }
  });

  // Serve Vite in development mode, or static build in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Zalo Chat backend running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start full-stack server:", err);
});
