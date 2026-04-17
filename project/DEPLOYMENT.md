# 🚀 Deployment Guide — GitHub Trending Bot

Hướng dẫn để deploy ứng dụng lên cloud và truy cập từ bất kỳ đâu.

---

## Tùy chọn Deployment

### ⭐ **Railway** (Khuyến nghị - dễ nhất)

Railway cung cấp free tier và deploy cực đơn giản (không cần card tín dụng ban đầu).

#### Bước 1: Chuẩn bị
1. Đẩy code lên GitHub
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/username/repo.git
   git push -u origin main
   ```

2. Truy cập https://railway.app và đăng nhập bằng GitHub

#### Bước 2: Deploy
1. Click **New Project** → **Deploy from GitHub repo**
2. Chọn repo `github-trending-bot`
3. Railway tự detect Node.js, cấu hình như sau:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

#### Bước 3: Environment Variables
1. Vào **Variables** tab
2. Thêm:
   ```
   GROQ_API_KEY=gsk_...
   GITHUB_TOKEN=ghp_...
   DAILY_REFRESH_TIME=00:00
   ```

3. Bấm **Deploy**

✅ **Xong!** Bạn sẽ nhận URL công khai (ví dụ: `https://github-trending-bot.railway.app`)

---

### 🟢 **Render**

Render có free tier nhưng app sẽ sleep nếu không có traffic trong 15 phút.

#### Bước 1: Chuẩn bị
- Push code lên GitHub (như Railway)

#### Bước 2: Deploy
1. Truy cập https://render.com và đăng nhập GitHub
2. Click **New** → **Web Service**
3. Chọn repo, chọn **Node**
4. Cấu hình:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

#### Bước 3: Biến môi trường
1. **Environment** tab
2. Thêm biến:
   ```
   GROQ_API_KEY=gsk_...
   GITHUB_TOKEN=ghp_...
   ```

3. Deploy

✅ URL công khai: `https://your-app-name.onrender.com`

---

### 💜 **Heroku** (Không còn free tier)

Heroku đã loại bỏ free tier nhưng vẫn đơn giản để deploy.

#### Bước 1: Chuẩn bị
```bash
# Cài Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

heroku login
heroku create github-trending-bot
```

#### Bước 2: Deploy
```bash
git push heroku main
```

#### Bước 3: Biến môi trường
```bash
heroku config:set GROQ_API_KEY=gsk_...
heroku config:set GITHUB_TOKEN=ghp_...
heroku open
```

---

### 🔵 **AWS EC2**

Để full control, sử dụng EC2 (có free tier 12 tháng).

#### Bước 1: Tạo EC2 Instance
1. https://aws.amazon.com → EC2
2. **Launch Instance**
   - OS: Ubuntu 22.04 LTS
   - Instance: `t2.micro` (free tier)
3. Mở inbound rules: HTTP (80), HTTPS (443), SSH (22)

#### Bước 2: SSH vào server
```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
```

#### Bước 3: Cài đặt
```bash
# Update & install Node.js
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# Clone repo
git clone https://github.com/username/github-trending-bot.git
cd github-trending-bot
npm install

# Tạo .env file
nano .env
# Thêm: GROQ_API_KEY, GITHUB_TOKEN, PORT=80 (hoặc 3000 + proxy)
```

#### Bước 4: Chạy với PM2 (process manager)
```bash
sudo npm install -g pm2
pm2 start server.js --name "trending-bot"
pm2 startup
pm2 save
```

#### Bước 5: Nginx (optional, để proxy port 80 → 3000)
```bash
sudo apt install -y nginx

# Config
sudo nano /etc/nginx/sites-available/default
```

Thêm vào `server` block:
```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

```bash
sudo systemctl restart nginx
```

---

### 🟠 **Replit** (Online IDE + Hosting)

Cách nhanh nhất cho testing online.

1. https://replit.com → **Import from GitHub**
2. Dán URL repo
3. Replit tự detect Node.js, setup **Secrets**
4. Thêm biến:
   - `GROQ_API_KEY=gsk_...`
   - `GITHUB_TOKEN=ghp_...`
5. Bấm **Run**

✅ URL: `https://replit-username.repl.co`

---

## So sánh Các Nền Tảng

| Platform  | Giá    | Dễ/Khó | Startup | Notes |
|-----------|--------|--------|--------|-------|
| **Railway** | Miễn phí | Rất dễ | 2 min | **Best choice** ⭐ |
| **Render**  | Miễn phí | Dễ | 5 min | App sleep nếu inactive |
| **Heroku**  | Từ $7/mo | Dễ | 5 min | Không còn free |
| **EC2** | ~$0-15/mo | Khó | 30 min | Full control |
| **Replit**  | Miễn phí | Rất dễ | 5 min | Lý tưởng testing |

---

## Domain Custom (Optional)

Sau khi deploy, bạn có thể gắn domain riêng:

### Railway
1. **Settings** → **Domains**
2. Thêm domain custom hoặc dùng subdomain miễn phí

### Render
1. **Settings** → **Custom Domain**
2. Thêm domain, cập nhật DNS records

### AWS
- Route 53 hoặc domain registrar bất kỳ

---

## Troubleshooting

### "Cannot find module 'dotenv'"
```bash
npm install
```

### Port đã bị chiếm
- Cloud platforms tự assign PORT, không cần lo

### Database connection issues
- Ứng dụng này sử dụng in-memory cache, không cần DB

### AI features không hoạt động
- Kiểm tra `GROQ_API_KEY` và `GITHUB_TOKEN` trong environment

---

## Kiểm tra Deployment

Sau deploy, test endpoints:

```bash
# Check status
curl https://your-app.railway.app/api/status

# Get trending repos
curl https://your-app.railway.app/api/trending

# Test chatbot
curl -X POST https://your-app.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"Best repos for beginners?","repos":[...]}'
```

---

## Giữ App Luôn Online

### Railway / Render / Heroku
- Automatic, luôn online

### EC2
- Sử dụng PM2 để auto-restart nếu crash
- Cấu hình cloudwatch để monitor

### Custom Server
- Sử dụng uptime monitoring (Uptime Robot, New Relic, v.v.)

---

## Next Steps

1. **Choose platform** → Railway (recommended)
2. **Push to GitHub**
3. **Connect & Deploy**
4. **Add environment variables**
5. **Share URL** → Truy cập từ mọi nơi! 🎉

---

## Liên hệ Hỗ Trợ

- Railway Support: https://railway.app/docs
- Render Docs: https://render.com/docs
- AWS EC2: https://docs.aws.amazon.com/ec2/
