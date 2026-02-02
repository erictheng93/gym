# Gym Nexus 部署指南

## 架構概覽

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                               │
├──────────────────────────────┬──────────────────────────────────┤
│      Cloudflare Pages        │       Cloudflare Tunnel          │
│   (Frontend - 全球 CDN)       │      (API Only)                  │
│                              │                                   │
│  admin.imfinethankyouandyou.com   │                              │
│  app.imfinethankyouandyou.com     │  api.imfinethankyouandyou.com│
│  coach.imfinethankyouandyou.com   │         │                    │
└──────────────────────────────┴─────────┼────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        VPS (Docker)                              │
├─────────────────────────────────────────────────────────────────┤
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│   │   Tunnel    │ ──── │  API :8056  │ ──── │ PostgreSQL  │     │
│   │ cloudflared │      │  (Hono.js)  │      │   :5432     │     │
│   └─────────────┘      └─────────────┘      └─────────────┘     │
│                              │                    │              │
│                              └────────────────────┘              │
│                           (Internal Docker Network)              │
└─────────────────────────────────────────────────────────────────┘
```

## 域名配置

| 子網域 | 用途 | 部署方式 |
|--------|------|----------|
| `api.imfinethankyouandyou.com` | Backend API | Cloudflare Tunnel |
| `admin.imfinethankyouandyou.com` | Admin Dashboard | Cloudflare Pages |
| `app.imfinethankyouandyou.com` | Member PWA | Cloudflare Pages |
| `coach.imfinethankyouandyou.com` | Coach App | Cloudflare Pages |

---

## Part 1: Backend 部署 (VPS + Cloudflare Tunnel)

### Step 1: 準備 VPS

```bash
# 安裝 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 安裝 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### Step 2: 建立 Cloudflare Tunnel

1. 前往 [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. **Networks** → **Tunnels** → **Create a tunnel**
3. 選擇 **Cloudflared**
4. 命名為 `gym-nexus`
5. 複製 **TUNNEL_TOKEN**

### Step 3: 設定 Public Hostname

在 Tunnel 設定頁面，加入：

| Public Hostname | Service | URL |
|-----------------|---------|-----|
| `api.imfinethankyouandyou.com` | HTTP | `http://api:8056` |

### Step 4: 部署到 VPS

```bash
# Clone 專案
git clone <your-repo> gym-nexus
cd gym-nexus/backend

# 建立環境變數檔
cp .env.production.example .env

# 編輯 .env，填入：
# - TUNNEL_TOKEN=<your-token>
# - DB_PASSWORD=<strong-password>
# - JWT_SECRET, SESSION_SECRET 等
nano .env

# 啟動服務
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 檢查狀態
docker compose ps
docker compose logs -f api
```

### Step 5: 驗證 API

```bash
# 本地測試
curl http://localhost:8056/health

# 透過 Tunnel 測試
curl https://api.imfinethankyouandyou.com/health
```

---

## Part 2: Frontend 部署 (Cloudflare Pages)

### 方法 A: 透過 Cloudflare Dashboard (推薦)

#### Admin Web

1. 前往 [Cloudflare Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages)
2. **Create application** → **Pages** → **Connect to Git**
3. 選擇你的 repository
4. 設定：
   - **Project name:** `gym-admin`
   - **Production branch:** `main`
   - **Build command:** `cd frontend && pnpm install && pnpm build:admin`
   - **Build output directory:** `frontend/apps/admin-web/.output/public`
5. **Environment variables:**
   ```
   API_BASE_URL = https://api.imfinethankyouandyou.com
   NODE_ENV = production
   ```
6. **Custom domain:** `admin.imfinethankyouandyou.com`

#### Member App

重複上述步驟，但設定：
- **Project name:** `gym-member`
- **Build command:** `cd frontend && pnpm install && pnpm build:member`
- **Build output directory:** `frontend/apps/member-app/.output/public`
- **Custom domain:** `app.imfinethankyouandyou.com`

#### Coach App

重複上述步驟，但設定：
- **Project name:** `gym-coach`
- **Build command:** `cd frontend && pnpm install && pnpm build:coach`
- **Build output directory:** `frontend/apps/coach-app/.output/public`
- **Custom domain:** `coach.imfinethankyouandyou.com`

### 方法 B: 透過 CLI

```bash
# 安裝 Wrangler
npm install -g wrangler

# 登入
wrangler login

# 建構並部署 Admin Web
cd frontend
pnpm install
pnpm build:admin
cd apps/admin-web
npx wrangler pages deploy .output/public --project-name=gym-admin

# 建構並部署 Member App
cd ../..
pnpm build:member
cd apps/member-app
npx wrangler pages deploy .output/public --project-name=gym-member

# 建構並部署 Coach App
cd ../..
pnpm build:coach
cd apps/coach-app
npx wrangler pages deploy .output/public --project-name=gym-coach
```

---

## Part 3: DNS 設定

在 Cloudflare DNS 確認以下記錄（Tunnel 和 Pages 會自動建立）：

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | api | `<tunnel-id>.cfargotunnel.com` | ✅ |
| CNAME | admin | `gym-admin.pages.dev` | ✅ |
| CNAME | app | `gym-member.pages.dev` | ✅ |
| CNAME | coach | `gym-coach.pages.dev` | ✅ |

---

## Part 4: 環境變數清單

### Backend (.env)

```bash
# Cloudflare Tunnel
TUNNEL_TOKEN=eyJhIjoixxxxxx...

# Database
DB_USER=gym_nexus
DB_PASSWORD=<STRONG_PASSWORD>
DB_DATABASE=gym_nexus

# API
NODE_ENV=production
CORS_ORIGIN=https://admin.imfinethankyouandyou.com,https://app.imfinethankyouandyou.com,https://coach.imfinethankyouandyou.com

# Auth (generate with: openssl rand -base64 32)
JWT_SECRET=<SECRET>
SESSION_SECRET=<SECRET>
MEMBER_JWT_SECRET=<SECRET>
COACH_JWT_SECRET=<SECRET>
```

### Frontend (Cloudflare Pages)

| Variable | Value |
|----------|-------|
| `API_BASE_URL` | `https://api.imfinethankyouandyou.com` |
| `NODE_ENV` | `production` |

---

## 維護指令

### Backend

```bash
# 查看日誌
docker compose logs -f api

# 重啟服務
docker compose restart api

# 更新部署
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 資料庫備份
docker compose exec database pg_dump -U gym_nexus gym_nexus > backup.sql
```

### Frontend

```bash
# 手動重新部署 (Cloudflare Dashboard)
# 或觸發 Git push 自動部署

# CLI 部署
pnpm build:admin && cd apps/admin-web && npx wrangler pages deploy .output/public
```

---

## 故障排除

### Tunnel 無法連線

```bash
# 檢查 Tunnel 狀態
docker compose logs tunnel

# 確認 Token 正確
echo $TUNNEL_TOKEN
```

### API CORS 錯誤

確認 `CORS_ORIGIN` 環境變數包含所有 frontend 域名（含 https://）

### Pages 建構失敗

1. 確認 `pnpm-lock.yaml` 已 commit
2. 確認 Node.js 版本相容 (使用 Node 20+)
3. 檢查建構日誌中的錯誤訊息
