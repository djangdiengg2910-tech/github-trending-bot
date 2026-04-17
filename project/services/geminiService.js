/**
 * geminiService.js
 * Wraps calls to the Google Gemini API (gemini-2.0-flash) via REST.
 *
 * Handles:
 *  - Exponential backoff for transient 429s (quota exceeded)
 *  - Fast-fail circuit-breaker: if the key is permanently invalid (bad key,
 *    billing disabled, etc.) we stop calling after 1 attempt and mark
 *    GEMINI_AVAILABLE = false for the lifetime of the process.
 */

const axios = require('axios');

const GEMINI_API_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Circuit-breaker flag — flipped to false when key is confirmed bad
let GEMINI_AVAILABLE = true;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Validate the Gemini API key format. Real keys look like "AIza…"
 * Keys starting with "AQ." or similar are Vertex AI or OAuth tokens
 * and won't work with the public Gemini REST API.
 */
function isValidKeyFormat(key) {
  return typeof key === 'string' && key.startsWith('AIza') && key.length > 20;
}

/**
 * Send a prompt to Gemini. Returns the response text.
 * Throws if the API is unavailable or returns an error.
 *
 * @param {string} prompt
 * @param {number} maxRetries  Max retry attempts on transient 429 (default 3)
 */
async function generateText(prompt, maxRetries = 3) {
  if (!GEMINI_AVAILABLE) {
    throw new Error('Gemini API is unavailable (invalid or missing API key).');
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    GEMINI_AVAILABLE = false;
    throw new Error('GEMINI_API_KEY is not set in environment variables.');
  }

  if (!isValidKeyFormat(apiKey)) {
    GEMINI_AVAILABLE = false;
    throw new Error(
      `GEMINI_API_KEY appears invalid (expected format: AIza…). ` +
      `Get a free key at https://aistudio.google.com/app/apikey`
    );
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(
        `${GEMINI_API_BASE}?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
      );

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from Gemini API');
      return text.trim();

    } catch (err) {
      const status = err.response?.status;

      // 401/403 → bad key — do not retry, disable permanently
      if (status === 401 || status === 403) {
        GEMINI_AVAILABLE = false;
        throw new Error(`Gemini API key rejected (HTTP ${status}). Check your GEMINI_API_KEY.`);
      }

      // 429/503 → quota / transient — retry with exponential backoff
      if ((status === 429 || status === 503) && attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt) * 1500; // 3s, 6s, 12s
        console.warn(`[gemini] Rate limited (${attempt}/${maxRetries}), retrying in ${waitMs / 1000}s…`);
        await sleep(waitMs);
        continue;
      }

      // Exhausted retries or unknown error
      throw err;
    }
  }
}

/**
 * Generate a 2–3 sentence summary for a GitHub repo.
 */
async function summarizeRepo(name, description, language) {
  const prompt =
    `You are a concise technical writer. Write a 2–3 sentence summary of what this GitHub ` +
    `repository does, who it is useful for, and any notable aspects.\n\n` +
    `Name: ${name}\nLanguage: ${language}\nDescription: ${description}\n\nSummary:`;
  return generateText(prompt);
}

/**
 * Answer a user question based ONLY on the provided repo list.
 */
async function answerQuestion(question, repos) {
  const ctx = repos
    .map((r, i) =>
      `[${i + 1}] ${r.name} (${r.language} · ⭐${r.stars})\n` +
      `    ${r.description}\n` +
      `    Summary: ${r.summary || 'N/A'}\n` +
      `    URL: ${r.url}`
    )
    .join('\n\n');

  const prompt =
    `You are a helpful assistant. Answer the user's question using ONLY the repositories below.\n` +
    `If you cannot answer from this data, say: "Không có đủ thông tin trong dữ liệu repo"\n\n` +
    `--- REPOS ---\n${ctx}\n--- END ---\n\n` +
    `Question: ${question}\nAnswer:`;

  return generateText(prompt);
}

/** True if the Gemini API is currently considered reachable */
function isAvailable() { return GEMINI_AVAILABLE; }

module.exports = { summarizeRepo, answerQuestion, isAvailable };
