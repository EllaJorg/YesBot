import OpenAI from "openai";

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

export default async function handler(req, res) {
  // Enable CORS - must be set before any response
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const original = String(req.body.prompt || "").trim();

    if (!original) {
      return res.status(400).json({ error: "no prompt" });
    }

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: OPTIMIZER_SYSTEM },
        { role: "user", content: `Original prompt: ${original}` }
      ],
      temperature: 0.25,
      max_tokens: 200
    });

    const optimized = resp.choices?.[0]?.message?.content?.trim() || "";
    return res.status(200).json({ original, optimized });
  } catch (err) {
    console.error("optimize error:", err);
    return res.status(500).json({ error: String(err) });
  }
}
