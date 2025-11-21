import OpenAI from "openai";

const WRAPPED_SYSTEM = `You are Alba's climate storyteller. Given daily energy (Wh), carbon (gCO2), and water (mL) totals from AI usage plus estimated savings, craft a recap that celebrates resources avoided. Respond ONLY with JSON matching this schema:
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
- Tone: upbeat, funky, funny, climate-savvy, confident, 1-2 sentences per field (skip heavy music references).
- Analogy: mix home energy, public transit, hydration, nature, and household objects so it feels tangible.
- Use the provided savings.* values for statValue + analogy (describe them as energy/carbon/water saved); mention totals.* only for context.
- Keep numbers realistic. Convert units to kWh, grams, minutes, liters when it improves clarity.
- Limit cards to 3 entries.`;

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

function estimateSavingsFromUsage(totals = {}, settings = {}) {
  const profileSavings = { small: 0.35, balanced: 0.25, large: 0.15 };
  const profileKey = settings.modelProfile || "balanced";
  const baseRate = profileSavings[profileKey] ?? 0.2;
  const optimizerBonus = settings.optimizerEnabled ? 0.1 : 0;
  const remoteBonus = settings.remoteOptimizer ? 0.05 : 0;
  const rate = Math.min(0.9, baseRate + optimizerBonus + remoteBonus);
  return {
    Wh: (totals.Wh || 0) * rate,
    gCO2: (totals.gCO2 || 0) * rate,
    waterMl: (totals.waterMl || 0) * rate,
    rate
  };
}

function buildFallbackWrapped(totals, savings, dateLabel) {
  const resolvedSavings = savings || estimateSavingsFromUsage(totals);
  const kWhSaved = resolvedSavings.Wh / 1000;
  const ledMinutesSaved =
    resolvedSavings.Wh > 0 ? (resolvedSavings.Wh / 0.008).toFixed(1) : "0";
  const phoneChargesSaved =
    resolvedSavings.Wh > 0 ? (resolvedSavings.Wh / 11).toFixed(1) : "0";
  const scooterKmSaved =
    resolvedSavings.gCO2 > 0 ? (resolvedSavings.gCO2 / 12).toFixed(1) : "0";
  const showerMl = 9500;
  const waterPercSaved = showerMl
    ? ((resolvedSavings.waterMl / showerMl) * 100).toFixed(1)
    : "0";
  const bottleRefills =
    resolvedSavings.waterMl > 0 ? (resolvedSavings.waterMl / 500).toFixed(1) : "0";
  return {
    headline: `Alba Eco Wrapped · ${dateLabel}`,
    subhead: resolvedSavings.Wh
      ? `Optimizing kept ${resolvedSavings.Wh.toFixed(2)} Wh (${kWhSaved.toFixed(
          3
        )} kWh) off the grid today.`
      : "No recorded savings yet — keep nudging prompts leaner and they'll show up here.",
    cards: [
      {
        title: "Energy Giveback",
        statLabel: "Wh saved",
        statValue: `${resolvedSavings.Wh.toFixed(2)} Wh`,
        analogy: resolvedSavings.Wh
          ? `Enough electricity saved to keep LED lights off for ${ledMinutesSaved} minutes and skip ${phoneChargesSaved} phone charges.`
          : "As soon as optimizations land, you'll see your watt savings here.",
        tip: "Batch similar asks so you don't boot a fresh model for each one."
      },
      {
        title: "Carbon Cut",
        statLabel: "CO₂ saved",
        statValue: `${resolvedSavings.gCO2.toFixed(2)} g`,
        analogy: resolvedSavings.gCO2
          ? `Avoided the CO₂ from a ${scooterKmSaved} km e-scooter trip by reusing context instead of regenerating output.`
          : "Log a prompt and reuse context to start charting carbon cuts.",
        tip: "Accept optimizer tips or trim drafts before sending to keep emissions down."
      },
      {
        title: "Water Steward",
        statLabel: "Water saved",
        statValue: `${resolvedSavings.waterMl.toFixed(0)} mL`,
        analogy: resolvedSavings.waterMl
          ? `Protected about ${waterPercSaved}% of a short shower — roughly ${bottleRefills} reusable bottles of clean water.`
          : "Keep prompts concise to see water savings ripple outward.",
        tip: "Stay text-first and avoid unnecessary regenerations when visuals aren't required."
      }
    ],
    cta: "Reuse context, embrace optimizer tips, and bank even more resource savings tomorrow.",
    footnote:
      "Estimates use Alba defaults only — treat this as an optimistic savings snapshot, not a utility bill."
  };
}

function coerceNumber(val) {
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

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

  const totals = req.body?.totals || {};
  const dateLabel = req.body?.dateLabel || new Date().toISOString().slice(0, 10);
  const settings = req.body?.settings || {};
  const metrics = {
    Wh: coerceNumber(totals.Wh),
    gCO2: coerceNumber(totals.gCO2),
    waterMl: coerceNumber(totals.waterMl)
  };
  const savings = estimateSavingsFromUsage(metrics, settings);

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const promptPayload = JSON.stringify({ dateLabel, totals: metrics, savings });
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
      return res.status(200).json(parsed);
    }
    return res.status(200).json(buildFallbackWrapped(metrics, savings, dateLabel));
  } catch (err) {
    console.error("wrapped error:", err);
    return res.status(500).json(buildFallbackWrapped(metrics, savings, dateLabel));
  }
}
