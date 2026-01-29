# 生產環境部署指南

## 架構概覽

```
┌─────────────────────────────────────────────────────────────┐
│                      Cloudflare                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │  Pages  │  │ Tunnel  │  │   R2    │  │   R2    │        │
│  │ 前端App │  │ 安全通道│  │ 上傳檔案│  │ 異地備份│        │
│  └─────────┘  └────┬────┘  └─────────┘  └─────────┘        │
└────────────────────┼────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              VPS (Ubuntu + Coolify + Docker)                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   Docker Services                    │    │
│  │  ┌──────────┐  ┌──────────┐                        │    │
│  │  │ Directus │  │PostgreSQL│  (核心服務)             │    │
│  │  └──────────┘  └──────────┘                        │    │
│  │  ┌──────────┐  ┌──────────┐                        │    │
│  │  │  Uptime  │  │ Netdata  │  (監控服務-可選)       │    │
│  │  │   Kuma   │  │          │                        │    │
│  │  └──────────┘  └──────────┘                        │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## 快速部署

### 1. 準備 VPS

```bash
# 安裝 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 安裝 Docker Compose
sudo apt install docker-compose-plugin

# 安裝 rclone (備份用)
curl https://rclone.org/install.sh | sudo bash
```

### 2. 部署應用

```bash
# Clone 專案
git clone <your-repo> /opt/gym
cd /opt/gym/backend

# 建立環境變數檔案
cp .env.example .env
# 編輯 .env 設定生產環境變數

# 啟動核心服務
docker-compose up -d

# (可選) 啟動監控服務
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

### 3. 設定備份

```bash
# 設定 R2 連接
chmod +x scripts/*.sh
./scripts/setup-rclone.sh

# 測試備份
./scripts/backup-to-r2.sh manual

# 設定自動備份 (crontab -e)
0 3 * * * /opt/gym/backend/scripts/backup-to-r2.sh daily >> /var/log/gym-backup.log 2>&1
0 4 * * 0 /opt/gym/backend/scripts/backup-to-r2.sh weekly >> /var/log/gym-backup.log 2>&1
```

## 服務端口

| 服務 | Port | 說明 |
|------|------|------|
| Directus | 8055 | API 服務 (透過 Tunnel 暴露) |
| PostgreSQL | 15432 | 資料庫 (不對外開放) |
| Uptime Kuma | 3001 | 監控面板 (可選) |
| Netdata | 19999 | 系統監控 (可選) |

## 監控設定

### Uptime Kuma 建議監控項目

訪問 `http://your-server:3001` 設定：

1. **Directus API**
   - Type: HTTP(s)
   - URL: `http://directus:8055/server/health`
   - Interval: 60s

2. **PostgreSQL**
   - Type: TCP Port
   - Host: database
   - Port: 5432
   - Interval: 60s

3. **前端網站**
   - Type: HTTP(s)
   - URL: `https://your-domain.com`
   - Interval: 60s

### Netdata 告警設定

訪問 `http://your-server:19999` 查看：

- CPU 使用率 > 80%
- RAM 使用率 > 85%
- 磁碟使用率 > 80%
- Docker 容器狀態

## 備份與恢復

### 備份結構

```
r2:gym-nexus-backup/
├── daily/           # 每日備份，保留 7 天
│   ├── database_20260129_030000.sql.gz
│   ├── uploads_20260129_030000.tar.gz
│   └── manifest_20260129_030000.json
├── weekly/          # 每週備份，保留 30 天
└── manual/          # 手動備份，保留 90 天
```

### 恢復備份

```bash
# 列出可用備份
./scripts/restore-from-r2.sh

# 恢復最新的每日備份
./scripts/restore-from-r2.sh daily latest

# 恢復特定日期的備份
./scripts/restore-from-r2.sh daily 20260129
```

## 環境變數 (生產環境)

```bash
# .env 必要設定
SECRET=<32字元以上的隨機字串>
ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD=<強密碼>

# 資料庫 (如果使用外部資料庫)
DB_HOST=your-db-host
DB_PASSWORD=<強密碼>

# CORS (設定你的前端域名)
CORS_ORIGIN=https://admin.your-domain.com,https://app.your-domain.com

# 備份通知 (可選)
DISCORD_WEBHOOK=https://discord.com/api/webhooks/xxx
```

## 常用維運命令

```bash
# 查看服務狀態
docker-compose ps

# 查看日誌
docker-compose logs -f directus

# 重啟服務
docker-compose restart

# 更新服務
docker-compose pull
docker-compose up -d

# 進入資料庫
docker exec -it backend-database-1 psql -U directus -d gym_nexus
```

## 擴展指南

當業務成長需要更高可用性時：

1. **資料庫外遷**: 遷移到 Supabase / Neon / RDS
2. **加入 Redis**: 取消註解 docker-compose.yml 中的 Redis 服務
3. **多實例**: 使用 Docker Swarm 或 Kubernetes
4. **CDN**: Cloudflare 已內建
