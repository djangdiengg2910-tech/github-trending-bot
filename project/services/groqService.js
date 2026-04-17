/**
 * groqService.js
 * Wraps calls to the Groq API (llama-3.3-70b-versatile) via REST.
 *
 * Handles:
 *  - Exponential backoff for transient 429s (rate limited)
 *  - Fast-fail circuit-breaker: if the key is permanently invalid
 *    we stop calling after 1 attempt and mark GROQ_AVAILABLE = false.
 *
 * Groq's API is OpenAI-compatible:
 *   POST https://api.groq.com/openai/v1/chat/completions
 *   Authorization: Bearer <GROQ_API_KEY>
 */

const axios = require('axios');

const GROQ_API_BASE = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL    = 'llama-3.3-70b-versatile';

// Circuit-breaker flag — flipped to false when key is confirmed bad
let GROQ_AVAILABLE = true;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Validate the Groq API key format — real keys start with "gsk_"
 */
function isValidKeyFormat(key) {
  return typeof key === 'string' && key.startsWith('gsk_') && key.length > 20;
}

/**
 * Send a prompt to Groq. Returns the response text.
 * Throws if the API is unavailable or returns an error.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {number} maxRetries  Max retry attempts on transient 429 (default 3)
 */
async function generateText(systemPrompt, userPrompt, maxRetries = 3) {
  if (!GROQ_AVAILABLE) {
    throw new Error('Groq API is unavailable (invalid or missing API key).');
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    GROQ_AVAILABLE = false;
    throw new Error('GROQ_API_KEY is not set in environment variables.');
  }

  if (!isValidKeyFormat(apiKey)) {
    GROQ_AVAILABLE = false;
    throw new Error(
      `GROQ_API_KEY appears invalid (expected format: gsk_…). ` +
      `Get a free key at https://console.groq.com/keys`
    );
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(
        GROQ_API_BASE,
        {
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt   },
          ],
          temperature: 0.7,
          max_tokens:  512,
        },
        {
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          timeout: 30000,
        }
      );

      const text = response.data?.choices?.[0]?.message?.content;
      if (!text) throw new Error('Empty response from Groq API');
      return text.trim();

    } catch (err) {
      const status = err.response?.status;

      // 401/403 → bad key — do not retry, disable permanently
      if (status === 401 || status === 403) {
        GROQ_AVAILABLE = false;
        throw new Error(`Groq API key rejected (HTTP ${status}). Check your GROQ_API_KEY.`);
      }

      // 429/503 → quota / transient — retry with exponential backoff
      if ((status === 429 || status === 503) && attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt) * 1500; // 3s, 6s, 12s
        console.warn(`[groq] Rate limited (${attempt}/${maxRetries}), retrying in ${waitMs / 1000}s…`);
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
  const system = 'You are a concise technical writer. Write brief, clear summaries of GitHub repositories.';
  const user =
    `Write a 2–3 sentence summary of what this GitHub repository does, who it is useful for, ` +
    `and any notable aspects.\n\nName: ${name}\nLanguage: ${language}\nDescription: ${description}\n\nSummary:`;
  return generateText(system, user);
}

/**
 * Answer a user question based ONLY on the provided repo list.
 */
async function answerQuestion(question, repos) {
  const ctx = repos
    .map((r, i) =>
      `[${i + 1}] ${r.name} (${r.full_name})\n` +
      `    Language: ${r.language} · ⭐${r.stars} · Forks: ${r.forks} · Watchers: ${r.watchers} · Open issues: ${r.openIssues}\n` +
      `    License: ${r.license} · Homepage: ${r.homepage}\n` +
      `    ${r.description}\n` +
      `    Summary: ${r.summary || 'N/A'}\n` +
      `    URL: ${r.url}`
    )
    .join('\n\n');

  const system =
    'You are a helpful Vietnamese technical assistant. Answer questions using ONLY the repository data provided. ' +
    'Focus on features, use cases, strengths, and what makes each repo useful. ' +
    'If the question asks for comparisons, choose the best matching repos and explain why. ' +
    'If you cannot answer from this data, respond: "Không có đủ thông tin trong dữ liệu repo".';

  const user =
    `--- REPOS ---\n${ctx}\n--- END ---\n\nQuestion: ${question}\nAnswer:`;

  return generateText(system, user);
}

/** True if the Groq API is currently considered reachable */
function isAvailable() { return GROQ_AVAILABLE; }

module.exports = { summarizeRepo, answerQuestion, isAvailable };
