# ============================================
# Gym Nexus - Docker Compose 管理
# ============================================
# 使用方式:
#   make up      - 啟動服務
#   make down    - 停止服務
#   make logs    - 查看日誌
#   make status  - 查看狀態
#
# Windows: 需安裝 make (choco install make)

.PHONY: up down restart status logs build clean help

.DEFAULT_GOAL := help

# ============================================
# 服務管理
# ============================================

## 啟動服務
up:
	docker-compose up -d

## 停止服務
down:
	docker-compose down

## 重啟服務
restart:
	docker-compose restart

## 查看狀態
status:
	docker-compose ps

## 查看日誌
logs:
	docker-compose logs -f

## 查看 Directus 日誌
logs-directus:
	docker-compose logs -f directus

## 查看 Tunnel 日誌
logs-tunnel:
	docker-compose logs -f tunnel

## 查看資料庫日誌
logs-db:
	docker-compose logs -f database

# ============================================
# 資料庫
# ============================================

## 進入資料庫 CLI
db-cli:
	docker-compose exec database psql -U directus -d gym_nexus

## 備份資料庫
db-backup:
	@mkdir -p backups
	docker-compose exec database pg_dump -U directus gym_nexus > backups/backup_$$(date +%Y%m%d_%H%M%S).sql
	@echo "備份完成"

# ============================================
# 開發
# ============================================

## 重建 image
build:
	docker-compose build

## 重建並啟動
rebuild: build up

## 清除未使用的 Docker 資源
clean:
	docker system prune -f

# ============================================
# 說明
# ============================================

help:
	@echo ""
	@echo "Gym Nexus Docker 管理"
	@echo "====================="
	@echo ""
	@echo "服務:"
	@echo "  make up          啟動服務"
	@echo "  make down        停止服務"
	@echo "  make restart     重啟服務"
	@echo "  make status      查看狀態"
	@echo ""
	@echo "日誌:"
	@echo "  make logs        查看所有日誌"
	@echo "  make logs-directus"
	@echo "  make logs-tunnel"
	@echo "  make logs-db"
	@echo ""
	@echo "資料庫:"
	@echo "  make db-cli      進入 psql"
	@echo "  make db-backup   備份 SQL"
	@echo ""
	@echo "開發:"
	@echo "  make build       重建 image"
	@echo "  make rebuild     重建並啟動"
	@echo "  make clean       清除 Docker 資源"
	@echo ""
