#!/bin/bash

# Quick Deploy Helper for GitHub Trending Bot
# Usage: bash deploy.sh <platform>
# Platforms: railway, render, heroku, ec2, replit

PLATFORM=$1

if [ -z "$PLATFORM" ]; then
  echo "❌ Platform not specified"
  echo "Usage: bash deploy.sh <platform>"
  echo ""
  echo "Supported platforms:"
  echo "  - railway    : https://railway.app (⭐ Recommended)"
  echo "  - render     : https://render.com"
  echo "  - heroku     : https://heroku.com"
  echo "  - ec2        : AWS EC2"
  echo "  - replit     : https://replit.com"
  exit 1
fi

case $PLATFORM in
  railway|render|heroku)
    echo "✅ Preparing for $PLATFORM deployment..."
    echo ""
    echo "1. Ensure code is pushed to GitHub:"
    echo "   git push origin main"
    echo ""
    echo "2. Go to $PLATFORM and import from GitHub"
    echo "3. Add these environment variables:"
    echo "   - GEMINI_API_KEY=AIza..."
    echo "   - GITHUB_TOKEN=ghp_..."
    echo "   - DAILY_REFRESH_TIME=00:00"
    echo ""
    echo "4. Deploy!"
    echo ""
    echo "📖 Detailed guide: See DEPLOYMENT.md"
    ;;
  ec2)
    echo "❌ EC2 deployment requires manual setup"
    echo "📖 See DEPLOYMENT.md for step-by-step guide"
    ;;
  replit)
    echo "✅ Deploying to Replit..."
    echo ""
    echo "1. Go to https://replit.com/~"
    echo "2. Click 'Create' → 'Import from GitHub'"
    echo "3. Paste: https://github.com/YOUR_USERNAME/github-trending-bot"
    echo "4. Add Secrets:"
    echo "   - GEMINI_API_KEY"
    echo "   - GITHUB_TOKEN"
    echo "5. Click 'Run'"
    ;;
  *)
    echo "❌ Unknown platform: $PLATFORM"
    exit 1
    ;;
esac

echo ""
echo "🚀 For detailed instructions, see DEPLOYMENT.md"
