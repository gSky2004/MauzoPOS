// Minimal Gemini client (free tier). No SDK dependency -- plain fetch.
// The API key travels in the x-goog-api-key header (never in URLs, logs or
// the frontend). All failures map to small codes; the controller turns those
// into friendly user messages. Raw provider errors never reach the client.
const env = require('../config/env');

const SYSTEM = `You are the MauzoOS Business Assistant for M&E Pub, a small Tanzanian shop. You help the administrator understand sales, inventory, expenses, debt, profit and business performance.

Rules you must always follow:
- Business data supplied by the application is verified data from the MauzoOS PostgreSQL database. It is the ONLY source of numbers, products, customers, sales, expenses and stock levels you may mention. Never invent any business fact.
- If the requested information is not in the supplied data, clearly say it is unavailable. Do not guess.
- You are read-only. You cannot modify, delete or create any business records. If asked to, politely refuse.
- Answer in the same language as the administrator: English for English, Swahili for Swahili. Mixed questions get a natural mixed answer. Do not translate product names. Always use TZS for currency.
- Distinguish verified facts from recommendations. Explain WHY you recommend something. Never state a guess as a certainty.
- Keep answers short and practical for a shop owner: brief paragraphs, bullet points, clear numbers. No SQL, no technical jargon, no AI terminology.`;

const askGemini = async ({ question, facts, rangeLabel }) => {
  if (!env.geminiApiKey) {
    const err = new Error('NO_KEY');
    err.code = 'NO_KEY';
    throw err;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent`;
  const prompt = `VERIFIED DATA FROM THE MAUZOOS DATABASE (period: ${rangeLabel}). Use ONLY these numbers.\n\`\`\`json\n${JSON.stringify(facts)}\n\`\`\`\n\nADMIN'S QUESTION: ${question}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiApiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    const err = new Error(e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK');
    err.code = e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message || '';
    } catch { /* ignore */ }
    const err = new Error('GEMINI_' + res.status);
    if (res.status === 429) err.code = 'QUOTA';
    else if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key|api_key/i.test(detail))) err.code = 'INVALID_KEY';
    else if (res.status === 404) err.code = 'BAD_MODEL';
    else err.code = 'UNAVAILABLE';
    throw err;
  }
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('')
    .trim();
  if (!text) {
    const err = new Error('EMPTY');
    err.code = 'EMPTY';
    throw err;
  }
  return text;
};

module.exports = { askGemini, SYSTEM };
