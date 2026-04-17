# 🔥 GitHub Trending Bot

> AI-powered dashboard that fetches today's trending GitHub repositories and provides an intelligent chatbot interface — powered by **Groq AI**.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https%3A%2F%2Fgithub.com%2Fyour-username%2Fgithub-trending-bot&envs=GROQ_API_KEY%2CGITHUB_TOKEN&requiredEnvs=GROQ_API_KEY&GROQAPIKEYDescription=Get+at+https%3A%2F%2Fconsole.groq.com%2Fkeys&GITHUBTOKENDescription=Optional%3A+get+at+https%3A%2F%2Fgithub.com%2Fsettings%2Ftokens)

👉 **Want to deploy online?** See [QUICK_DEPLOY.md](QUICK_DEPLOY.md) (5 minutes setup)

---

## Features

- 🔎 **Trending Repos** — Fetches top repos from GitHub Search API (today → 7 days → 30 days fallback)
- ✨ **AI Summaries** — Each repo gets a 2–3 sentence Groq-powered summary
- 💬 **Chatbot** — Ask anything about the trending repos in natural language
- 🔄 **Daily Auto-Refresh** — Automatically refreshes trending repos daily at midnight (configurable)
- 🔄 **Auto-Refresh on Expiry** — Cache auto-refreshes when expiring within 1 hour
- 🔄 **Manual Refresh** — Force refresh trending data anytime with the refresh button
- 📅 **Last Updated** — Shows when data was last fetched
- ⚡ **24-hour Cache** — Results are cached in-memory to avoid repeated API calls
- 🔒 **Circuit Breaker** — Gracefully handles invalid/missing Groq API keys

---

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Backend  | Node.js + Express                 |
| Frontend | Vanilla JS + HTML + CSS           |
| AI       | Groq (llama-3.3-70b-versatile)    |
| Data     | GitHub Search API                 |
| Cache    | In-memory (Map + TTL)             |

---

## Getting Started

### 1. Clone & Install

```bash
git clone <repo-url>
cd project
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your keys:

```env
# GitHub Personal Access Token (optional but recommended — avoids rate limits)
# Create at: https://github.com/settings/tokens (no scopes needed for public repos)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# Groq API Key — MUST start with "gsk_"
# Get a free key at: https://console.groq.com/keys
GROQ_API_KEY=gsk_...

PORT=3000

# Daily refresh time (HH:mm format, 24-hour clock). Default: 00:00 (midnight)
DAILY_REFRESH_TIME=00:00
```

> ⚠️ **Important**: The Groq key must start with `gsk_`. Keys starting with `AQ.` are OAuth tokens (Vertex AI) and will **not** work with the Groq REST API.

### 3. Run

```bash
# Production
npm start

# Development (auto-reload on file changes)
npm run dev
```

Then open **http://localhost:3000** in your browser.

### 4. Deploy Online

To make the app accessible online from anywhere, deploy on a cloud platform.

**⭐ Fastest:** See [QUICK_DEPLOY.md](QUICK_DEPLOY.md) for 5-minute Railway setup

**Other platforms:**
- [Render](https://render.com) — Similar to Railway, free tier
- [Heroku](https://www.heroku.com) — Requires credit card (~$7/month)
- [AWS EC2](https://aws.amazon.com/ec2) — Full control, requires setup knowledge

For detailed guides on all platforms, see [DEPLOYMENT.md](DEPLOYMENT.md)

---

## Project Structure

```
project/
├── server.js               # Express server + API routes
├── services/
│   ├── groqService.js      # Groq API wrapper (retry + circuit-breaker)
│   ├── githubService.js    # GitHub Search API wrapper (date fallback)
│   └── cacheService.js     # In-memory TTL cache
├── public/
│   ├── index.html          # Frontend HTML
│   ├── app.js              # Frontend JavaScript
│   └── style.css           # Dark glassmorphism styles
├── .env                    # Environment variables (not committed)
├── .env.example            # Template for .env
└── package.json
```

---

## API Endpoints

| Method | Path            | Description                                      |
|--------|-----------------|--------------------------------------------------|
| GET    | `/api/status`   | Returns Groq API availability status            |
| GET    | `/api/trending` | Returns trending repos with AI summaries (cached)|
| GET    | `/api/refresh`  | Force refresh trending repos (bypass cache)     |
| POST   | `/api/chat`     | Chatbot Q&A — body: `{ question, repos[] }`     |

---

## Environment Variables

| Variable            | Required | Description                                         |
|---------------------|----------|-----------------------------------------------------|
| `GROQ_API_KEY`      | Yes*     | Groq API key (format: `gsk_...`)                    |
| `GITHUB_TOKEN`      | No       | GitHub PAT — increases rate limit from 60→5000      |
| `PORT`              | No       | Server port (default: `3000`)                       |
| `DAILY_REFRESH_TIME`| No       | Daily refresh time (HH:mm, 24h format, default `00:00`) |

*Without a valid key, the app still works but AI summaries and chatbot are disabled.

---

## How Cache & Refresh Works

1. **Initial Load**: Server fetches trending repos from GitHub and caches them for 24 hours
2. **Daily Auto-Refresh**: At midnight (or configured time), the server automatically refreshes data
3. **On-Expiry Auto-Refresh**: If cache is about to expire (< 1 hour left), it auto-refreshes
4. **Manual Refresh**: Click the **Refresh** button to force-refresh immediately (bypasses cache)

---

## Troubleshooting

### AI features disabled / "Summary unavailable"
- Ensure `GROQ_API_KEY` starts with `gsk_` — get one free at https://console.groq.com/keys
- Restart the server after updating `.env`

### GitHub rate limit errors
- Add a `GITHUB_TOKEN` to `.env` (no special scopes needed for public repos)
- Create one at https://github.com/settings/tokens

### Chatbot not responding
- The chatbot requires a valid Groq API key
- Check the warning banner at the top of the page for guidance
