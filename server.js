// server.js (minimal)
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai"; // npm install openai

dotenv.config();
const app = express();
app.use(cors()); // local dev; tighten in prod
app.use(bodyParser.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM = "Make this user prompt shorter and more concise while preserving the meaning.";

app.post("/optimize", async (req, res) => {
  try {
    const original = String(req.body.prompt || "").trim();
    if (!original) return res.status(400).json({ error: "no prompt" });

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini", // or gpt-5 etc.
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Original prompt: ${original}` }
      ],
      temperature: 0.25,
      max_tokens: 200
    });

    const optimized = resp.choices?.[0]?.message?.content?.trim() || "";
    return res.json({ original, optimized });
  } catch (err) {
    console.error("optimize error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`optimizer server listening on http://localhost:${PORT}`));
