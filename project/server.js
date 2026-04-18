/**
 * server.js — GitHub Trending Summary Bot
 *
 * Routes:
 *   GET  /api/trending   – trending repos with AI summaries (24-hour cache)
 *   GET  /api/status     – reports whether Gemini AI is available
 *   POST /api/chat       – chatbot Q&A using Gemini
 */

require('dotenv').config({ override: true });

const express = require('express');
const path    = require('path');

const { fetchTrendingRepos }                         = require('./services/githubService');
const { summarizeRepo, answerQuestion, isAvailable } = require('./services/geminiService');
const cache                                          = require('./services/cacheService');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Startup check ─────────────────────────────────────────────────────────────
(function checkEnv() {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) {
    console.warn('\n⚠️  GEMINI_API_KEY is not set — AI features will be disabled.\n');
  } else if (!key.startsWith('AIza')) {
    console.warn(
      '\n⚠️  GEMINI_API_KEY looks invalid (expected format: AIza…).\n' +
      '   Get a free key at: https://aistudio.google.com/app/apikey\n' +
      '   AI features will be disabled until a valid key is provided.\n'
    );
  } else {
    console.log('✅ Gemini API key detected.\n');
  }
})();

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json());

// Enable CORS for frontend on localhost:3001
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3001');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ── GET /api/status ───────────────────────────────────────────────────────────
// Lets the frontend know whether Gemini is functional.
app.get('/api/status', (_req, res) => {
  res.json({
    geminiAvailable: isAvailable(),
    geminiKeyValid:  (process.env.GEMINI_API_KEY || '').startsWith('AIza'),
  });
});

// ── GET /api/trending ─────────────────────────────────────────────────────────
app.get('/api/trending', async (req, res) => {
  const topic = req.query.topic || 'all';
  const mode = req.query.mode || 'stars'; // 'stars' or 'updated'
  const days = parseInt(req.query.days) || 7;
  const CACHE_KEY = `trending_repos_${mode}_${days}_${topic}`;

  try {
    const cached = cache.get(CACHE_KEY);
    if (cached) {
      console.log('[cache] Returning cached repos for mode:', mode, 'topic:', topic);
      const lastUpdated = cache.getLastUpdated(CACHE_KEY);
      return res.json({ repos: cached, lastUpdated, topic, mode, days });
    }

    // 1. Fetch repos from GitHub
    console.log('[github] Fetching repos for mode:', mode, 'days:', days, 'topic:', topic);
    const repos = await fetchTrendingRepos(10, mode, days, topic);

    // 2. Enrich with Gemini summaries (skip if key is invalid)
    const enriched = [];
    const geminiOk = isAvailable();

    if (geminiOk) {
      console.log(`[gemini] Summarising ${repos.length} repos sequentially…`);
      for (const repo of repos) {
        try {
          const summary = await summarizeRepo(repo.name, repo.description, repo.language);
          enriched.push({ ...repo, summary });
          console.log(`[gemini] ✓ ${repo.name}`);
        } catch (err) {
          console.error(`[gemini] ✗ ${repo.name}: ${err.message}`);
          enriched.push({ ...repo, summary: 'Summary unavailable' });
        }
        // Small pause between calls to respect RPM limits
        if (isAvailable()) await new Promise((r) => setTimeout(r, 300));
        else {
          // Circuit opened mid-batch — fill remaining without Gemini
          console.warn('[gemini] Circuit open — skipping remaining summaries');
          break;
        }
      }
      // Fill any repos that didn't get processed after circuit opened
      for (let i = enriched.length; i < repos.length; i++) {
        enriched.push({ ...repos[i], summary: 'Summary unavailable' });
      }
    } else {
      console.log('[gemini] Skipping summaries — Gemini API key is invalid/missing');
      repos.forEach((r) => enriched.push({ ...r, summary: 'Summary unavailable' }));
    }

    cache.set(CACHE_KEY, enriched);
    console.log('[cache] Trending repos cached for 24 hours');
    const lastUpdated = cache.getLastUpdated(CACHE_KEY);
    return res.json({ repos: enriched, lastUpdated, topic, mode, days });

  } catch (err) {
    console.error('[github] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch trending repositories', details: err.message });
  }
});

// ── POST /api/chat ─────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { question, repos } = req.body;

  if (!question || !Array.isArray(repos) || repos.length === 0) {
    return res.status(400).json({ error: 'Provide a "question" and a non-empty "repos" array.' });
  }

  if (!isAvailable()) {
      return res.status(503).json({
        error: 'Gemini API is unavailable. Please set a valid GEMINI_API_KEY (get one free at https://aistudio.google.com/app/apikey).',
      });
    }
  try {
    console.log(`[chat] "${question}"`);
    const answer = await answerQuestion(question, repos);
    return res.json({ answer });
  } catch (err) {
    console.error('[chat] Error:', err.message);
    return res.status(500).json({ error: 'Failed to get answer from Gemini', details: err.message });
  }
});

// ── GET /api/refresh ──────────────────────────────────────────────────────────
app.get('/api/refresh', async (req, res) => {
  const topic = req.query.topic || 'all';
  const mode = req.query.mode || 'stars';
  const days = parseInt(req.query.days) || 7;
  const CACHE_KEY = `trending_repos_${mode}_${days}_${topic}`;

  try {
    // Clear existing cache
    cache.del(CACHE_KEY);

    // Fetch fresh data
    console.log('[refresh] Force refreshing repos for mode:', mode, 'days:', days, 'topic:', topic);
    const repos = await fetchTrendingRepos(10, mode, days, topic);

    // Enrich with summaries
    const enriched = [];
    const geminiOk = isAvailable();

    if (geminiOk) {
      console.log(`[refresh] Summarising ${repos.length} repos…`);
      for (const repo of repos) {
        try {
          const summary = await summarizeRepo(repo.name, repo.description, repo.language);
          enriched.push({ ...repo, summary });
          console.log(`[refresh] ✓ ${repo.name}`);
        } catch (err) {
          console.error(`[refresh] ✗ ${repo.name}: ${err.message}`);
          enriched.push({ ...repo, summary: 'Summary unavailable' });
        }
        if (isAvailable()) await new Promise((r) => setTimeout(r, 300));
        else break;
      }
      for (let i = enriched.length; i < repos.length; i++) {
        enriched.push({ ...repos[i], summary: 'Summary unavailable' });
      }
    } else {
      repos.forEach((r) => enriched.push({ ...r, summary: 'Summary unavailable' }));
    }

    cache.set(CACHE_KEY, enriched);
    const lastUpdated = cache.getLastUpdated(CACHE_KEY);
    console.log('[refresh] Force refresh completed');
    return res.json({ repos: enriched, lastUpdated, refreshed: true, topic, mode, days });

  } catch (err) {
    console.error('[refresh] Error:', err.message);
    return res.status(500).json({ error: 'Failed to refresh repositories', details: err.message });
  }
});

// ── Auto-refresh cache ────────────────────────────────────────────────────────
async function autoRefreshCache() {
  const CACHE_KEY = 'trending_repos';
  const entry = cache.get(CACHE_KEY);

  if (!entry) return; // No cache to refresh

  const now = Date.now();
  const timeUntilExpiry = entry.expiresAt - now;
  const oneHour = 60 * 60 * 1000;

  // If cache expires within 1 hour, refresh it
  if (timeUntilExpiry <= oneHour) {
    console.log('[auto-refresh] Cache expiring soon, refreshing...');
    try {
      // Force refresh by clearing cache first
      cache.del(CACHE_KEY);

      // Fetch new data (this will set new cache)
      const repos = await fetchTrendingRepos(10);
      const enriched = [];
      const geminiOk = isAvailable();

      if (geminiOk) {
        console.log(`[auto-refresh] Summarising ${repos.length} repos...`);
        for (const repo of repos) {
          try {
            const summary = await summarizeRepo(repo.name, repo.description, repo.language);
            enriched.push({ ...repo, summary });
          } catch (err) {
            console.error(`[auto-refresh] ✗ ${repo.name}: ${err.message}`);
            enriched.push({ ...repo, summary: 'Summary unavailable' });
          }
          if (isAvailable()) await new Promise((r) => setTimeout(r, 300));
          else break;
        }
        for (let i = enriched.length; i < repos.length; i++) {
          enriched.push({ ...repos[i], summary: 'Summary unavailable' });
        }
      } else {
        repos.forEach((r) => enriched.push({ ...r, summary: 'Summary unavailable' }));
      }

      cache.set(CACHE_KEY, enriched);
      console.log('[auto-refresh] Cache refreshed successfully');
    } catch (err) {
      console.error('[auto-refresh] Failed to refresh cache:', err.message);
    }
  }
}

// ── Daily scheduled refresh ──────────────────────────────────────────────────
function getDailyRefreshTime() {
  const now = new Date();
  const next = new Date();
  next.setHours(0, 0, 0, 0); // Midnight
  next.setDate(next.getDate() + 1); // Tomorrow
  
  const msUntilMidnight = next.getTime() - now.getTime();
  return msUntilMidnight;
}

async function dailyRefreshJob() {
  const CACHE_KEY = 'trending_repos';
  console.log('[daily-refresh] Starting daily refresh job...');
  
  try {
    cache.del(CACHE_KEY);
    const repos = await fetchTrendingRepos(10);
    const enriched = [];
    const geminiOk = isAvailable();

    if (geminiOk) {
      console.log(`[daily-refresh] Summarising ${repos.length} repos...`);
      for (const repo of repos) {
        try {
          const summary = await summarizeRepo(repo.name, repo.description, repo.language);
          enriched.push({ ...repo, summary });
        } catch (err) {
          console.error(`[daily-refresh] ✗ ${repo.name}: ${err.message}`);
          enriched.push({ ...repo, summary: 'Summary unavailable' });
        }
        if (isAvailable()) await new Promise((r) => setTimeout(r, 300));
        else break;
      }
      for (let i = enriched.length; i < repos.length; i++) {
        enriched.push({ ...repos[i], summary: 'Summary unavailable' });
      }
    } else {
      repos.forEach((r) => enriched.push({ ...r, summary: 'Summary unavailable' }));
    }

    cache.set(CACHE_KEY, enriched);
    console.log('[daily-refresh] ✅ Daily refresh completed');
  } catch (err) {
    console.error('[daily-refresh] Failed:', err.message);
  }
  
  // Schedule next daily refresh (at next midnight)
  const nextRefreshIn = getDailyRefreshTime();
  console.log(`[daily-refresh] Next refresh in ${Math.round(nextRefreshIn / 1000 / 60)} minutes`);
  setTimeout(dailyRefreshJob, nextRefreshIn);
}

// Schedule daily refresh at midnight
const initialDelay = getDailyRefreshTime();
setTimeout(dailyRefreshJob, initialDelay);
console.log(`[init] Daily refresh scheduled in ${Math.round(initialDelay / 1000 / 60)} minutes (at 00:00)\n`);

// Check every 30 minutes for cache refresh
setInterval(autoRefreshCache, 30 * 60 * 1000);

// ── Listen ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 GitHub Trending Bot → http://localhost:${PORT}\n`);
});
