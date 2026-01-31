# ============================================
# Gym Nexus - Docker Compose 環境管理
# ============================================
# 使用方式:
#   make dev          - 啟動開發環境
#   make prod         - 啟動生產環境
#   make prod-monitor - 啟動生產環境 + 監控
#   make down         - 停止所有服務
#   make logs         - 查看日誌
#   make status       - 查看服務狀態
#
# Windows 用戶: 需安裝 make (choco install make) 或使用 WSL

.PHONY: dev prod prod-monitor down logs status ps backup clean help

# 預設顯示說明
.DEFAULT_GOAL := help

# ============================================
# 環境啟動
# ============================================

## 啟動開發環境
dev:
	docker-compose up -d

## 啟動生產環境
prod:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

## 啟動生產環境 + 監控
prod-monitor:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.monitoring.yml up -d

# ============================================
# 服務管理
# ============================================

## 停止所有服務
down:
	docker-compose down

## 停止所有服務並刪除 volumes (危險!)
down-v:
	@echo "警告: 這會刪除所有資料! 按 Ctrl+C 取消, 或 Enter 繼續..."
	@read confirm
	docker-compose down -v

## 重啟服務
restart:
	docker-compose restart

## 查看服務狀態
status:
	docker-compose ps

## 查看服務狀態 (簡寫)
ps: status

## 查看日誌 (全部)
logs:
	docker-compose logs -f

## 查看 Directus 日誌
logs-directus:
	docker-compose logs -f directus

## 查看資料庫日誌
logs-db:
	docker-compose logs -f database

# ============================================
# 資料庫操作
# ============================================

## 進入資料庫 CLI
db-cli:
	docker-compose exec database psql -U directus -d gym_nexus

## 備份資料庫 (開發環境)
db-backup:
	@mkdir -p backups
	docker-compose exec database pg_dump -U directus gym_nexus > backups/backup_$$(date +%Y%m%d_%H%M%S).sql
	@echo "備份完成: backups/backup_$$(date +%Y%m%d_%H%M%S).sql"

## 備份 Named Volumes (生產環境)
backup-volumes:
	@mkdir -p backups
	docker run --rm -v gym_db_data:/data -v $$(pwd)/backups:/backup alpine tar czf /backup/db_data_$$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
	docker run --rm -v gym_directus_uploads:/data -v $$(pwd)/backups:/backup alpine tar czf /backup/uploads_$$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
	@echo "備份完成於 backups/"

# ============================================
# 開發工具
# ============================================

## 重建 Directus image
build:
	docker-compose build directus

## 重建並啟動 (開發)
rebuild: build dev

## 清除未使用的 Docker 資源
clean:
	docker system prune -f

# ============================================
# 說明
# ============================================

## 顯示此說明
help:
	@echo ""
	@echo "Gym Nexus Docker 管理指令"
	@echo "========================="
	@echo ""
	@echo "環境啟動:"
	@echo "  make dev            啟動開發環境"
	@echo "  make prod           啟動生產環境"
	@echo "  make prod-monitor   啟動生產環境 + 監控"
	@echo ""
	@echo "服務管理:"
	@echo "  make down           停止所有服務"
	@echo "  make restart        重啟服務"
	@echo "  make status         查看服務狀態"
	@echo "  make logs           查看所有日誌"
	@echo "  make logs-directus  查看 Directus 日誌"
	@echo "  make logs-db        查看資料庫日誌"
	@echo ""
	@echo "資料庫:"
	@echo "  make db-cli         進入資料庫 CLI"
	@echo "  make db-backup      備份資料庫 (SQL)"
	@echo "  make backup-volumes 備份 Named Volumes"
	@echo ""
	@echo "開發:"
	@echo "  make build          重建 Directus image"
	@echo "  make rebuild        重建並啟動"
	@echo "  make clean          清除未使用的 Docker 資源"
	@echo ""
