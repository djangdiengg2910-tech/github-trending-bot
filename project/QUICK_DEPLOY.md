# 🚀 Quick Deploy in 5 Minutes

## Railway (Recommended) ⭐

### Prerequisite
- GitHub account
- Groq API key from https://console.groq.com/keys

### Steps

1. **Create GitHub Repository**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/github-trending-bot.git
   git push -u origin main
   ```

2. **Deploy on Railway**
   - Go to https://railway.app
   - Click **New Project** → **Deploy from GitHub repo**
   - Select your `github-trending-bot` repo

3. **Add Environment Variables**
   - In Railway Dashboard → **Variables** tab
   - Add:
     ```
     GROQ_API_KEY=gsk_your_key_here
     GITHUB_TOKEN=ghp_your_token_here (optional)
     DAILY_REFRESH_TIME=00:00
     ```

4. **Deploy**
   - Railway auto-detects Node.js
   - Click **Deploy**

✅ **Done!** Your app is live at: `https://github-trending-bot.railway.app`

---

## Other Platforms

- [Render](https://render.com) — Similar to Railway, with free tier
- [Heroku](https://heroku.com) — Paid ($7/month minimum)
- [AWS EC2](https://aws.amazon.com/ec2) — Full control, complex setup
- [Replit](https://replit.com) — Online IDE + Hosting, free

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed guides.

---

## Test Your Deployment

```bash
# Check if app is running
curl https://your-app-url/api/status

# Get trending repos
curl https://your-app-url/api/trending

# You're done! 🎉
```

## Accessing from Anywhere

Once deployed, share the URL:
- Mobile, tablet, desktop — all work
- No localhost needed
- Real-time updates with daily auto-refresh

---

## Troubleshooting

### ❌ "Cannot find module"
- Make sure all dependencies are installed: `npm install`
- Check `package.json` exists

### ❌ "GROQ_API_KEY is not set"
- Add `GROQ_API_KEY` to Environment Variables in your cloud dashboard
- Make sure it starts with `gsk_`

### ❌ "Port already in use"
- Cloud platforms auto-assign ports, no action needed
- LocalHost issues: use different port `PORT=3001`

### ❌ "502 Bad Gateway"
- Wait 1-2 minutes for deployment to fully complete
- Check logs in cloud dashboard

---

Need help? See [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive guides.
