/**
 * Alba AI Client - Direct GitHub Models Integration
 *
 * Calls GitHub Models API directly from the extension.
 * PAT is injected at build time via GitHub Actions.
 */

// Placeholder replaced at build time - DO NOT COMMIT ACTUAL TOKEN
const GITHUB_TOKEN = '__GITHUB_TOKEN__';

const GITHUB_MODELS_URL = 'https://models.inference.ai.azure.com/chat/completions';
const MODEL_ID = 'gpt-4o-mini';

// Simple rate limiter: max calls per minute
const RATE_LIMIT = { maxPerMinute: 10, calls: [], blocked: false };

function checkRateLimit() {
  const now = Date.now();
  RATE_LIMIT.calls = RATE_LIMIT.calls.filter(t => now - t < 60000);
  if (RATE_LIMIT.calls.length >= RATE_LIMIT.maxPerMinute) {
    return false;
  }
  RATE_LIMIT.calls.push(now);
  return true;
}

const OPTIMIZER_SYSTEM = `You are an expert prompt engineer. You compress prompts to use minimum tokens. Keep EXACT same meaning but remove ALL unnecessary words.

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

CRITICAL: Output ONLY the compressed version. Nothing else.`;

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
- Tone: upbeat, funky, funny, climate-savvy, confident, 1-2 sentences per field.
- Analogy: mix home energy, public transit, hydration, nature, and household objects.
- Use the provided savings.* values for statValue + analogy; mention totals.* only for context.
- Keep numbers realistic. Convert units when it improves clarity.
- Limit cards to 3 entries.`;

/**
 * Check if the AI client is configured (has a valid token)
 */
function isConfigured() {
  return GITHUB_TOKEN && GITHUB_TOKEN !== '__GITHUB_TOKEN__' && GITHUB_TOKEN.length > 10;
}

/**
 * Call GitHub Models API
 */
async function callGitHubModels(systemPrompt, userMessage, options = {}) {
  if (!isConfigured()) {
    console.warn('[Alba] GitHub token not configured');
    return null;
  }

  if (!checkRateLimit()) {
    console.warn('[Alba] Rate limit exceeded, skipping API call');
    return null;
  }

  const { temperature = 0.7, maxTokens = 500 } = options;

  try {
    const response = await fetch(GITHUB_MODELS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GITHUB_TOKEN}`
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Alba] GitHub Models API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('[Alba] GitHub Models request failed:', err);
    return null;
  }
}

/**
 * Optimize a prompt using AI
 */
async function optimizePrompt(prompt) {
  if (!prompt?.trim()) return null;

  const result = await callGitHubModels(
    OPTIMIZER_SYSTEM,
    `Original prompt: ${prompt}`,
    { temperature: 0.25, maxTokens: 200 }
  );

  return result;
}

/**
 * Extract JSON from AI response (handles markdown code blocks)
 */
function extractJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/```(?:json)?([\s\S]*?)```/i);
  const payload = match ? match[1] : trimmed;

  try {
    return JSON.parse(payload);
  } catch (err) {
    console.warn('[Alba] JSON parse failed for wrapped payload');
    return null;
  }
}

/**
 * Estimate savings based on usage and settings
 */
function estimateSavingsFromUsage(totals = {}, settings = {}) {
  const profileSavings = { small: 0.35, balanced: 0.25, large: 0.15 };
  const profileKey = settings.modelProfile || 'balanced';
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

/**
 * Build fallback wrapped content when AI is unavailable
 */
function buildFallbackWrapped(totals, savings, dateLabel) {
  const resolvedSavings = savings || estimateSavingsFromUsage(totals);
  const kWhSaved = resolvedSavings.Wh / 1000;
  const ledMinutesSaved = resolvedSavings.Wh > 0 ? (resolvedSavings.Wh / 0.008).toFixed(1) : '0';
  const phoneChargesSaved = resolvedSavings.Wh > 0 ? (resolvedSavings.Wh / 11).toFixed(1) : '0';
  const scooterKmSaved = resolvedSavings.gCO2 > 0 ? (resolvedSavings.gCO2 / 12).toFixed(1) : '0';
  const showerMl = 9500;
  const waterPercSaved = showerMl ? ((resolvedSavings.waterMl / showerMl) * 100).toFixed(1) : '0';
  const bottleRefills = resolvedSavings.waterMl > 0 ? (resolvedSavings.waterMl / 500).toFixed(1) : '0';

  return {
    headline: `Alba Eco Wrapped`,
    subhead: resolvedSavings.Wh
      ? `Optimizing kept ${resolvedSavings.Wh.toFixed(2)} Wh (${kWhSaved.toFixed(3)} kWh) off the grid today.`
      : 'No recorded savings yet — keep nudging prompts leaner and they\'ll show up here.',
    cards: [
      {
        title: 'Energy Giveback',
        statLabel: 'Wh saved',
        statValue: `${resolvedSavings.Wh.toFixed(2)} Wh`,
        analogy: resolvedSavings.Wh
          ? `Enough electricity saved to keep LED lights off for ${ledMinutesSaved} minutes and skip ${phoneChargesSaved} phone charges.`
          : 'As soon as optimizations land, you\'ll see your watt savings here.',
        tip: 'Batch similar asks so you don\'t boot a fresh model for each one.'
      },
      {
        title: 'Carbon Cut',
        statLabel: 'CO2 saved',
        statValue: `${resolvedSavings.gCO2.toFixed(2)} g`,
        analogy: resolvedSavings.gCO2
          ? `Avoided the CO2 from a ${scooterKmSaved} km e-scooter trip by reusing context.`
          : 'Log a prompt and reuse context to start charting carbon cuts.',
        tip: 'Accept optimizer tips or trim drafts before sending.'
      },
      {
        title: 'Water Steward',
        statLabel: 'Water saved',
        statValue: `${resolvedSavings.waterMl.toFixed(0)} mL`,
        analogy: resolvedSavings.waterMl
          ? `Protected about ${waterPercSaved}% of a short shower — roughly ${bottleRefills} reusable bottles.`
          : 'Keep prompts concise to see water savings ripple outward.',
        tip: 'Stay text-first and avoid unnecessary regenerations.'
      }
    ],
    cta: 'Reuse context, embrace optimizer tips, and bank even more savings tomorrow.',
    footnote: 'Estimates use Alba defaults only — treat this as a savings snapshot, not a utility bill.'
  };
}

/**
 * Generate wrapped summary using AI
 */
async function generateWrappedSummary(totals, dateLabel, settings = {}) {
  const metrics = {
    Wh: Number(totals.Wh) || 0,
    gCO2: Number(totals.gCO2) || 0,
    waterMl: Number(totals.waterMl) || 0
  };
  const savings = estimateSavingsFromUsage(metrics, settings);

  // If AI not configured, return fallback immediately
  if (!isConfigured()) {
    return buildFallbackWrapped(metrics, savings, dateLabel);
  }

  const promptPayload = JSON.stringify({ dateLabel, totals: metrics, savings });

  const result = await callGitHubModels(
    WRAPPED_SYSTEM,
    `Create the recap for: ${promptPayload}`,
    { temperature: 0.9, maxTokens: 600 }
  );

  if (result) {
    const parsed = extractJson(result);
    if (parsed) {
      return parsed;
    }
  }

  // Fallback if AI fails
  return buildFallbackWrapped(metrics, savings, dateLabel);
}

// Export for use in content.js
globalThis.ALBA_AI_CLIENT = {
  isConfigured,
  optimizePrompt,
  generateWrappedSummary,
  estimateSavingsFromUsage,
  buildFallbackWrapped
};
