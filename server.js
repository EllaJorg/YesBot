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

const OPTIMIZER_SYSTEM = `You are an expert prompt engineer.You compress prompts to use minimum tokens. Keep EXACT same meaning but remove ALL unnecessary words.

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
        { role: "system", content: OPTIMIZER_SYSTEM },
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

const WRAPPED_SYSTEM = `You are Alba's climate storyteller. Given daily energy (Wh), carbon (gCO2), and water (mL) totals from AI usage, you craft a playful Spotify Wrapped style recap with vivid but credible analogies. Respond ONLY with JSON matching this schema:
{
  "headline": string,
  "subhead": string,
  "cards": [
    {
      "title": string,
      "statLabel": string,
      "statValue": string,
      "analogy": string,
      "tip": string
    }
  ],
  "cta": string,
  "footnote": string
}

Guidelines:
- Tone: upbeat, musical, confident, 1-2 sentences per field.
- Analogy: connect each stat to intuitive objects (smart speakers, bike rides, kettle boils, playlists, etc.).
- Keep numbers realistic. Convert units to kWh, grams, minutes, liters when it improves clarity.
- Limit cards to 3 entries.`;

app.post("/wrapped", async (req, res) => {
  const totals = req.body?.totals || {};
  const dateLabel = req.body?.dateLabel || new Date().toISOString().slice(0, 10);
  const metrics = {
    Wh: coerceNumber(totals.Wh),
    gCO2: coerceNumber(totals.gCO2),
    waterMl: coerceNumber(totals.waterMl)
  };

  try {
    const promptPayload = JSON.stringify({ dateLabel, totals: metrics });
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: WRAPPED_SYSTEM },
        { role: "user", content: `Create the recap for: ${promptPayload}` }
      ],
      temperature: 0.9,
      max_tokens: 600
    });

    const raw = resp.choices?.[0]?.message?.content?.trim();
    const parsed = extractJson(raw);
    if (parsed) {
      return res.json(parsed);
    }
    return res.json(buildFallbackWrapped(metrics, dateLabel));
  } catch (err) {
    console.error("wrapped error:", err);
    return res.status(500).json(buildFallbackWrapped(metrics, dateLabel));
  }
});

function extractJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/```(?:json)?([\s\S]*?)```/i);
  const payload = match ? match[1] : trimmed;
  try {
    return JSON.parse(payload);
  } catch (err) {
    console.warn("JSON parse failed for wrapped payload");
    return null;
  }
}

function buildFallbackWrapped(totals, dateLabel) {
  const kWh = totals.Wh / 1000;
  const ledMinutes = totals.Wh > 0 ? (totals.Wh / 0.008).toFixed(1) : "0";
  const showerMl = 9500;
  const waterPerc = showerMl ? ((totals.waterMl / showerMl) * 100).toFixed(1) : "0";
  return {
    headline: `Alba Eco Wrapped · ${dateLabel}`,
    subhead: totals.Wh
      ? `Today's AI groove used ${totals.Wh.toFixed(2)} Wh — a ${kWh.toFixed(3)} kWh micro tour.`
      : "No recorded energy today, so your vibe stayed off the grid.",
    cards: [
      {
        title: "Energy Mood",
        statLabel: "Watt-hours",
        statValue: `${totals.Wh.toFixed(2)} Wh`,
        analogy: totals.Wh
          ? `Roughly the same spark as running an LED strip for ${ledMinutes} minutes.`
          : "Once data rolls in you'll see how your power groove compares.",
        tip: "Short, pointed prompts keep this meter low tomorrow."
      },
      {
        title: "Carbon Chorus",
        statLabel: "CO₂",
        statValue: `${totals.gCO2.toFixed(2)} g`,
        analogy: totals.gCO2
          ? `Comparable to a sip of seltzer's fizz turning into ${totals.gCO2.toFixed(2)} grams of CO₂.`
          : "Add a prompt to get a carbon chorus.",
        tip: "Try batching follow-up questions so you reuse the same response instead of generating new ones."
      },
      {
        title: "Water Remix",
        statLabel: "Water",
        statValue: `${totals.waterMl.toFixed(0)} mL`,
        analogy: totals.waterMl
          ? `About ${waterPerc}% of a quick shower's freshwater cost.`
          : "Keep riffing and we'll show the ripple.",
        tip: "Images and audio inputs cost more water — stay text-only when you can."
      }
    ],
    cta: "Pause between prompts and remix with low-energy models to drop tomorrow's beat.",
    footnote: "Estimates use Alba defaults only — consider this a vibe check, not a utility bill."
  };
}

function coerceNumber(val) {
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`optimizer server listening on http://localhost:${PORT}`));
