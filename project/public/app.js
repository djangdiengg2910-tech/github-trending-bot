/**
 * app.js — GitHub Trending Bot
 * Fetches trending repos, renders cards, runs the chatbot.
 */

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let currentRepos = [];
let geminiOk     = false;
let currentTopic = 'all';
let currentMode  = 'stars';
let currentDays  = 7;
let currentUser  = null;

const USER_STORAGE_KEY = 'trendingBotUser';
const CACHE_WINDOW_MS  = 24 * 60 * 60 * 1000; // 24 hours

function getUserStorageKey() {
  return `trendingBotCache:${currentUser || 'guest'}`;
}

function loadSearchCache() {
  try {
    return JSON.parse(localStorage.getItem(getUserStorageKey())) || {};
  } catch {
    return {};
  }
}

function saveSearchCache(cache) {
  try {
    localStorage.setItem(getUserStorageKey(), JSON.stringify(cache));
  } catch (err) {
    console.warn('[cache] Could not save search cache:', err.message);
  }
}

function makeSearchKey(topic, mode, days) {
  return `${topic}|${mode}|${days}`;
}

function getCachedSearch(topic, mode, days) {
  const cache = loadSearchCache();
  const entry = cache[makeSearchKey(topic, mode, days)];
  if (!entry || !entry.repos) return null;
  const age = Date.now() - (entry.timestamp || 0);
  if (age > CACHE_WINDOW_MS) return null;
  return entry;
}

function saveCachedSearch(topic, mode, days, repos, lastUpdated) {
  const cache = loadSearchCache();
  cache[makeSearchKey(topic, mode, days)] = {
    repos,
    lastUpdated,
    timestamp: Date.now(),
  };
  saveSearchCache(cache);
}

function getStaleSearch(topic, mode, days) {
  const cache = loadSearchCache();
  return cache[makeSearchKey(topic, mode, days)];
}

function setCacheIndicator(active) {
  cacheIndicator.hidden = !active;
}

function renderAuthState() {
  if (currentUser) {
    loginToggle.hidden = true;
    loginForm.hidden   = true;
    userDisplay.hidden = false;
    userNameEl.textContent = currentUser;
  } else {
    loginToggle.hidden = false;
    loginForm.hidden   = true;
    userDisplay.hidden = true;
    userNameEl.textContent = '';
  }
}

async function updateGeminiStatus() {
  try {
    const sr = await fetch('/api/status');
    const sd = await sr.json();
    geminiOk = sd.geminiAvailable && sd.geminiKeyValid;
  } catch (_) {
    geminiOk = false;
  }
  if (!geminiOk) aiBanner.hidden = false;
}

function initAuth() {
  currentUser = localStorage.getItem(USER_STORAGE_KEY);
  renderAuthState();
}

function signIn(username) {
  currentUser = username;
  localStorage.setItem(USER_STORAGE_KEY, username);
  renderAuthState();
}

function signOut() {
  localStorage.removeItem(USER_STORAGE_KEY);
  currentUser = null;
  renderAuthState();
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const aiBanner     = document.getElementById('ai-banner');
const repoBadge    = document.getElementById('repo-badge');
const refreshBtn   = document.getElementById('refresh-btn');
const topicInput   = document.getElementById('topic-input');
const topicSuggestions = document.getElementById('topic-suggestions');
const datePickerWrapper = document.getElementById('date-picker-wrapper');
const dateSelect   = document.getElementById('date-select');

const reposLoading = document.getElementById('repos-loading');
const reposError   = document.getElementById('repos-error');
const reposErrMsg  = document.getElementById('repos-error-msg');
const reposGrid    = document.getElementById('repos-grid');

const chatHistory  = document.getElementById('chat-history');
const chatInput    = document.getElementById('chat-input');
const chatSend     = document.getElementById('chat-send');
const suggestions  = document.getElementById('chat-suggestions');
const cacheIndicator = document.getElementById('cache-indicator');
const loginToggle   = document.getElementById('login-toggle');
const loginForm     = document.getElementById('login-form');
const usernameInput = document.getElementById('username-input');
const loginSubmit   = document.getElementById('login-submit');
const userDisplay   = document.getElementById('user-display');
const userNameEl    = document.getElementById('user-name');
const logoutBtn     = document.getElementById('logout-btn');

// ── Language → colour map ─────────────────────────────────────────────────────
const LANG_COLOR = {
  JavaScript:'#f1e05a', TypeScript:'#3178c6', Python:'#3572A5',
  Rust:'#dea584',       Go:'#00ADD8',          Java:'#b07219',
  'C++':'#f34b7d',      C:'#555555',           Ruby:'#701516',
  PHP:'#4F5D95',        Swift:'#F05138',        Kotlin:'#A97BFF',
  HTML:'#e34c26',       CSS:'#563d7c',          Shell:'#89e051',
  Dart:'#00B4AB',       Scala:'#c22d40',        Elixir:'#6e4a7e',
};
const langColor = (l) => LANG_COLOR[l] || '#484f58';

// ── Popular topics for suggestions ─────────────────────────────────────────────
const POPULAR_TOPICS = [
  'javascript', 'python', 'machine-learning', 'web-development', 'react',
  'nodejs', 'typescript', 'go', 'rust', 'java', 'cpp', 'csharp', 'php',
  'ruby', 'swift', 'kotlin', 'dart', 'scala', 'elixir', 'shell', 'docker',
  'kubernetes', 'aws', 'android', 'ios', 'blockchain', 'data-science',
  'devops', 'game-development', 'mobile', 'security', 'testing', 'ui-ux',
  'vue', 'angular', 'svelte', 'nextjs', 'nuxt', 'express', 'fastapi',
  'django', 'flask', 'spring', 'laravel', 'rails', 'dotnet', 'flutter'
];

// ── XSS guard ─────────────────────────────────────────────────────────────────
const esc = (s) => s == null ? '' : String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

// ── Format star count ─────────────────────────────────────────────────────────
const fmtStars = (n) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);

// ── Render one repo card ──────────────────────────────────────────────────────
function renderCard(repo, idx) {
  const card = document.createElement('article');
  card.className = 'repo-card';
  card.style.animationDelay = `${idx * 55}ms`;

  const hassummary  = repo.summary && repo.summary !== 'Summary unavailable';
  const summaryHtml = hassummary
    ? `<div class="ai-block">
         <div class="ai-label">✨ AI Summary</div>
         ${esc(repo.summary)}
       </div>`
    : `<div class="ai-block ai-unavailable">
         <div class="ai-label">✨ AI Summary</div>
         <em>Not available — add a valid Gemini API key</em>
       </div>`;

  const langHtml = repo.language !== 'Unknown'
    ? `<span class="lang-dot" style="background:${langColor(repo.language)}"></span>
       <span>${esc(repo.language)}</span>`
    : `<span>${esc(repo.language)}</span>`;

  card.innerHTML = `
    <div class="card-head">
      <div>
        <a class="repo-link"
           href="${esc(repo.url)}"
           target="_blank"
           rel="noopener noreferrer">${esc(repo.name)}</a>
        <span class="repo-full-name">${esc(repo.full_name || '')}</span>
      </div>
      <span class="stars-pill">⭐ ${fmtStars(repo.stars)}</span>
    </div>
    <p class="repo-desc">${esc(repo.description)}</p>
    <div class="card-meta">${langHtml}</div>
    ${summaryHtml}
    <div class="card-footer">
      <a class="btn-repo"
         href="${esc(repo.url)}"
         target="_blank"
         rel="noopener noreferrer">
        View on GitHub →
      </a>
    </div>`;

  return card;
}

// ── Show repos ────────────────────────────────────────────────────────────────
function displayRepos(repos, lastUpdated) {
  reposGrid.innerHTML = '';
  repos.forEach((r, i) => reposGrid.appendChild(renderCard(r, i)));
  reposGrid.hidden = false;
  repoBadge.textContent = `${repos.length} repos`;
  repoBadge.hidden      = false;

  // Update last updated time
  updateLastUpdatedDisplay(lastUpdated);
}

// ── Load /api/status then /api/trending ──────────────────────────────────────
async function loadTrending(topic = 'all', mode = 'stars', days = 7) {
  // Reset UI
  reposLoading.style.display = 'flex';
  reposError.hidden  = true;
  reposGrid.hidden   = true;
  repoBadge.hidden   = true;
  aiBanner.hidden    = true;
  setChat(false);
  currentRepos = [];
  currentTopic = topic;
  currentMode  = mode;
  currentDays  = days;
  setCacheIndicator(false);

  try {
    // 1. Check Gemini availability first so chat state is correct
    await updateGeminiStatus();

    // 2. Try local cache first to save API calls and Gemini tokens
    const cached = getCachedSearch(topic, mode, days);
    if (cached) {
      currentRepos = cached.repos;
      const lastUpdated = cached.lastUpdated || cached.timestamp;
      reposLoading.style.display = 'none';
      displayRepos(currentRepos, lastUpdated);
      setCacheIndicator(true);
      setChat(geminiOk);
      return;
    }

    // 2. Fetch trending repos from backend
    const params = new URLSearchParams({
      topic: topic,
      mode: mode,
      days: days.toString()
    });
    const res  = await fetch(`/api/trending?${params}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    currentRepos = data.repos;
    const lastUpdated = data.lastUpdated;

    reposLoading.style.display = 'none';
    displayRepos(currentRepos, lastUpdated);
    saveCachedSearch(topic, mode, days, currentRepos, lastUpdated);
    setChat(true);

  } catch (err) {
    const stale = getStaleSearch(topic, mode, days);
    if (stale && stale.repos && stale.repos.length) {
      currentRepos = stale.repos;
      reposLoading.style.display = 'none';
      displayRepos(currentRepos, stale.lastUpdated || stale.timestamp);
      setCacheIndicator(true);
      reposErrMsg.textContent = `Loaded cached results because the request failed: ${err.message}`;
      reposError.hidden = false;
      console.warn('[app] loadTrending fallback to stale cache:', err);
      setChat(true);
      return;
    }

    reposLoading.style.display = 'none';
    reposErrMsg.textContent = err.message || 'Failed to load repositories.';
    reposError.hidden          = false;
    console.error('[app] loadTrending error:', err);
  }
}

// ── Force refresh repos ──────────────────────────────────────────────────────
async function forceRefresh() {
  // Reset UI
  reposLoading.style.display = 'flex';
  reposError.hidden  = true;
  reposGrid.hidden   = true;
  repoBadge.hidden   = true;
  aiBanner.hidden    = true;
  setChat(false);
  currentRepos = [];
  setCacheIndicator(false);

  try {
    // Fetch fresh data (bypass cache)
    const params = new URLSearchParams({
      topic: currentTopic,
      mode: currentMode,
      days: currentDays.toString()
    });
    const res = await fetch(`/api/refresh?${params}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    currentRepos = data.repos;
    const lastUpdated = data.lastUpdated;

    reposLoading.style.display = 'none';
    displayRepos(currentRepos, lastUpdated);
    saveCachedSearch(currentTopic, currentMode, currentDays, currentRepos, lastUpdated);
    setChat(true);

  } catch (err) {
    const stale = getStaleSearch(currentTopic, currentMode, currentDays);
    if (stale && stale.repos && stale.repos.length) {
      currentRepos = stale.repos;
      reposLoading.style.display = 'none';
      displayRepos(currentRepos, stale.lastUpdated || stale.timestamp);
      setCacheIndicator(true);
      reposErrMsg.textContent = `Could not refresh; showing cached results: ${err.message}`;
      reposError.hidden = false;
      console.warn('[app] forceRefresh fallback to stale cache:', err);
      setChat(true);
      return;
    }

    reposLoading.style.display = 'none';
    reposErrMsg.textContent    = err.message || 'Failed to refresh repositories.';
    reposError.hidden          = false;
    console.error('[app] forceRefresh error:', err);
  }
}
function updateLastUpdatedDisplay(timestamp) {
  const lastUpdatedEl = document.getElementById('last-updated');
  if (lastUpdatedEl && timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));

    let timeText;
    if (diffHours < 1) {
      timeText = diffMins <= 1 ? 'just now' : `${diffMins} minutes ago`;
    } else if (diffHours < 24) {
      timeText = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else {
      const diffDays = Math.floor(diffHours / 24);
      timeText = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    }

    lastUpdatedEl.textContent = `Last updated: ${timeText}`;
    lastUpdatedEl.hidden = false;
  }
}

// ── Enable / disable chat ─────────────────────────────────────────────────────
function setChat(enabled) {
  chatInput.disabled = !enabled;
  chatSend.disabled  = !enabled;
  document.querySelectorAll('.chip').forEach(c => c.disabled = !enabled);
  if (enabled) {
    chatInput.placeholder = geminiOk
      ? 'Ask about today\'s trending repos…'
      : 'Chatbot unavailable — Gemini API key required';
    chatInput.disabled = !geminiOk;
    chatSend.disabled  = !geminiOk;
    document.querySelectorAll('.chip').forEach(c => c.disabled = !geminiOk);
  }
}

// ── Append a message bubble ───────────────────────────────────────────────────
function addMsg(role, text) {
  const wrap   = document.createElement('div');
  wrap.className = `msg ${role}-msg`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'user' ? '👤' : '🤖';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = esc(text).replace(/\n/g, '<br>');

  wrap.append(avatar, bubble);
  chatHistory.appendChild(wrap);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  return wrap;
}

// ── Typing indicator ──────────────────────────────────────────────────────────
function showTyping() {
  const wrap   = document.createElement('div');
  wrap.className = 'msg bot-msg';
  wrap.id      = 'typing';
  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = '🤖';
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
  wrap.append(avatar, bubble);
  chatHistory.appendChild(wrap);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}
function removeTyping() {
  document.getElementById('typing')?.remove();
}

// ── Send a chat message ───────────────────────────────────────────────────────
async function sendMessage(question) {
  question = (question || chatInput.value).trim();
  if (!question || !currentRepos.length) return;

  chatInput.value = '';
  setChat(false);
  addMsg('user', question);
  showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, repos: currentRepos }),
    });
    const data = await res.json();
    removeTyping();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    addMsg('bot', data.answer);
  } catch (err) {
    removeTyping();
    addMsg('bot', `⚠️ ${err.message}`);
  } finally {
    setChat(true);
    chatInput.focus();
  }
}

// ── Topic input and suggestions ──────────────────────────────────────────────
function showTopicSuggestions(input) {
  const query = input.toLowerCase().trim();
  if (!query) {
    topicSuggestions.hidden = true;
    return;
  }

  const matches = POPULAR_TOPICS.filter(topic =>
    topic.toLowerCase().includes(query)
  ).slice(0, 8);

  if (matches.length === 0) {
    topicSuggestions.hidden = true;
    return;
  }

  topicSuggestions.innerHTML = '';
  matches.forEach(topic => {
    const item = document.createElement('div');
    item.className = 'topic-suggestion-item';
    item.textContent = topic;
    item.addEventListener('click', () => {
      topicInput.value = topic;
      topicSuggestions.hidden = true;
      loadTrending(topic, currentMode, currentDays);
    });
    topicSuggestions.appendChild(item);
  });

  topicSuggestions.hidden = false;
}

function hideTopicSuggestions() {
  setTimeout(() => {
    topicSuggestions.hidden = true;
  }, 150);
}

// ── Mode switching ────────────────────────────────────────────────────────────
function handleModeChange() {
  const selectedMode = document.querySelector('input[name="search-mode"]:checked').value;
  currentMode = selectedMode;

  if (selectedMode === 'updated') {
    datePickerWrapper.hidden = false;
    currentDays = parseInt(dateSelect.value);
  } else {
    datePickerWrapper.hidden = true;
    currentDays = 7; // default for stars mode
  }

  loadTrending(currentTopic, currentMode, currentDays);
}

// ── Date selection ────────────────────────────────────────────────────────────
function handleDateChange() {
  currentDays = parseInt(dateSelect.value);
  if (currentMode === 'updated') {
    loadTrending(currentTopic, currentMode, currentDays);
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────
loginToggle.addEventListener('click', () => {
  loginForm.hidden = !loginForm.hidden;
  if (!loginForm.hidden) usernameInput.focus();
});
loginSubmit.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  if (!username) return;
  signIn(username);
});
usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const username = usernameInput.value.trim();
    if (!username) return;
    signIn(username);
  }
});
logoutBtn.addEventListener('click', signOut);

chatSend.addEventListener('click', () => sendMessage());
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
refreshBtn.addEventListener('click', forceRefresh);

// Topic input
topicInput.addEventListener('input', (e) => {
  showTopicSuggestions(e.target.value);
});

topicInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const topic = topicInput.value.trim() || 'all';
    topicSuggestions.hidden = true;
    loadTrending(topic, currentMode, currentDays);
  } else if (e.key === 'Escape') {
    topicSuggestions.hidden = true;
  }
});

topicInput.addEventListener('blur', hideTopicSuggestions);

// Mode switching
document.querySelectorAll('input[name="search-mode"]').forEach(radio => {
  radio.addEventListener('change', handleModeChange);
});

// Date selection
dateSelect.addEventListener('change', handleDateChange);

// Chip suggestions
suggestions.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip && !chip.disabled) sendMessage(chip.dataset.q);
});

// ── Init ──────────────────────────────────────────────────────────────────────
initAuth();
loadTrending('all', 'stars', 7);
