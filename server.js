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

const SYSTEM = `You are an expert prompt engineer.You compress prompts to use minimum tokens. Keep EXACT same meaning but remove ALL unnecessary words.

RULES:
1. Strip politeness: please, kindly, could you, would you, can you → DELETE
2. Strip filler: really, very, just, actually, basically → DELETE  
3. Simplify actions: "help me write" → "write", "I want to" → "", "I need" → ""
4. Direct commands only: "Explain how X works" → "Explain X"
5. No meta-requests: "write a prompt that" → just the actual request

EXAMPLES:
Input: "Please help me write a Python function"
Output: "Python function"

Input: "Could you kindly explain machine learning to me?"
Output: "Explain machine learning"

Input: "I want to learn how to code in JavaScript"
Output: "Learn JavaScript"

Input: "Please kindly help me write a really long prompt that could be shorter"
Output: "Shorten prompt"

Input: "Can you help me debug this code?"
Output: "Debug code"

Input: "I need you to act as a teacher and explain calculus"
Output: "Explain calculus"

CRITICAL: Output ONLY the compressed version. Nothing else.`;

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
