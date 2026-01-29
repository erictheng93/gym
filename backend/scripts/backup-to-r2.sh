#!/bin/bash
# ============================================
# Gym Nexus - 自動備份腳本 (Cloudflare R2)
# ============================================
# 用法: ./backup-to-r2.sh [daily|weekly|manual]
# Crontab 範例:
#   0 3 * * * /opt/gym/scripts/backup-to-r2.sh daily >> /var/log/gym-backup.log 2>&1
#   0 4 * * 0 /opt/gym/scripts/backup-to-r2.sh weekly >> /var/log/gym-backup.log 2>&1

set -euo pipefail

# ============================================
# 配置區 (生產環境請修改這些值)
# ============================================
BACKUP_TYPE="${1:-manual}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/tmp/gym-backup-${DATE}"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

# R2 配置 (透過 rclone)
R2_REMOTE="r2"                          # rclone remote 名稱
R2_BUCKET="gym-nexus-backup"            # R2 bucket 名稱

# Docker 容器名稱
DB_CONTAINER="backend-database-1"

# 備份保留天數
DAILY_RETENTION_DAYS=7
WEEKLY_RETENTION_DAYS=30
MANUAL_RETENTION_DAYS=90

# Webhook 通知 (可選，留空則不通知)
DISCORD_WEBHOOK="${DISCORD_WEBHOOK:-}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"

# ============================================
# 函數定義
# ============================================

log() {
    echo "${LOG_PREFIX} $1"
}

send_notification() {
    local status="$1"
    local message="$2"

    if [[ -n "$DISCORD_WEBHOOK" ]]; then
        local emoji="✅"
        [[ "$status" == "error" ]] && emoji="❌"
        curl -s -X POST -H "Content-Type: application/json" \
            -d "{\"content\": \"${emoji} **Gym Nexus Backup** - ${message}\"}" \
            "$DISCORD_WEBHOOK" > /dev/null || true
    fi

    if [[ -n "$SLACK_WEBHOOK" ]]; then
        curl -s -X POST -H "Content-Type: application/json" \
            -d "{\"text\": \"Gym Nexus Backup: ${message}\"}" \
            "$SLACK_WEBHOOK" > /dev/null || true
    fi
}

cleanup() {
    log "清理暫存目錄..."
    rm -rf "$BACKUP_DIR"
}

trap cleanup EXIT

check_dependencies() {
    log "檢查依賴..."

    if ! command -v rclone &> /dev/null; then
        log "錯誤: rclone 未安裝"
        log "安裝方式: curl https://rclone.org/install.sh | sudo bash"
        exit 1
    fi

    if ! docker ps | grep -q "$DB_CONTAINER"; then
        log "錯誤: 資料庫容器 $DB_CONTAINER 未運行"
        exit 1
    fi

    if ! rclone lsd "${R2_REMOTE}:" &> /dev/null; then
        log "錯誤: rclone remote '$R2_REMOTE' 未配置或無法連接"
        log "請先運行: rclone config"
        exit 1
    fi
}

backup_database() {
    log "備份 PostgreSQL 資料庫..."

    local db_file="${BACKUP_DIR}/database_${DATE}.sql.gz"

    docker exec "$DB_CONTAINER" pg_dump \
        -U directus \
        -d gym_nexus \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists \
        | gzip > "$db_file"

    local size=$(du -h "$db_file" | cut -f1)
    log "資料庫備份完成: $size"

    echo "$db_file"
}

backup_uploads() {
    log "備份上傳檔案..."

    local uploads_dir="/opt/gym/backend/uploads"
    local uploads_file="${BACKUP_DIR}/uploads_${DATE}.tar.gz"

    if [[ -d "$uploads_dir" ]]; then
        tar -czf "$uploads_file" -C "$(dirname "$uploads_dir")" "$(basename "$uploads_dir")" 2>/dev/null || true
        local size=$(du -h "$uploads_file" | cut -f1)
        log "上傳檔案備份完成: $size"
        echo "$uploads_file"
    else
        log "警告: 上傳目錄不存在，跳過"
        echo ""
    fi
}

upload_to_r2() {
    log "上傳備份到 R2..."

    local remote_path="${R2_REMOTE}:${R2_BUCKET}/${BACKUP_TYPE}/"

    rclone copy "$BACKUP_DIR/" "$remote_path" \
        --progress \
        --transfers 4 \
        --checkers 8

    log "上傳完成: $remote_path"
}

cleanup_old_backups() {
    log "清理過期備份..."

    local retention_days
    case "$BACKUP_TYPE" in
        daily)  retention_days=$DAILY_RETENTION_DAYS ;;
        weekly) retention_days=$WEEKLY_RETENTION_DAYS ;;
        *)      retention_days=$MANUAL_RETENTION_DAYS ;;
    esac

    local remote_path="${R2_REMOTE}:${R2_BUCKET}/${BACKUP_TYPE}/"

    rclone delete "$remote_path" \
        --min-age "${retention_days}d" \
        --verbose 2>&1 | grep -E "^(Deleted|INFO)" || true

    log "已清理 ${retention_days} 天前的 ${BACKUP_TYPE} 備份"
}

create_backup_manifest() {
    log "建立備份清單..."

    local manifest_file="${BACKUP_DIR}/manifest_${DATE}.json"

    cat > "$manifest_file" <<EOF
{
    "timestamp": "$(date -Iseconds)",
    "type": "${BACKUP_TYPE}",
    "hostname": "$(hostname)",
    "files": [
        $(find "$BACKUP_DIR" -type f -name "*.gz" -exec basename {} \; | sed 's/.*/"&"/' | paste -sd,)
    ],
    "database_version": "$(docker exec $DB_CONTAINER psql -U directus -d gym_nexus -t -c 'SELECT version();' | head -1 | xargs)",
    "backup_script_version": "1.0.0"
}
EOF

    log "清單已建立"
}

verify_backup() {
    log "驗證備份完整性..."

    local db_file=$(find "$BACKUP_DIR" -name "database_*.sql.gz" | head -1)

    if [[ -n "$db_file" ]]; then
        if gzip -t "$db_file" 2>/dev/null; then
            log "資料庫備份檔案驗證通過"
        else
            log "錯誤: 資料庫備份檔案損壞"
            return 1
        fi
    fi

    return 0
}

# ============================================
# 主程式
# ============================================

main() {
    log "========================================="
    log "開始 ${BACKUP_TYPE} 備份"
    log "========================================="

    mkdir -p "$BACKUP_DIR"

    check_dependencies

    # 執行備份
    backup_database
    backup_uploads

    # 建立清單並驗證
    create_backup_manifest

    if ! verify_backup; then
        send_notification "error" "備份驗證失敗 (${BACKUP_TYPE})"
        exit 1
    fi

    # 上傳到 R2
    upload_to_r2

    # 清理舊備份
    cleanup_old_backups

    log "========================================="
    log "備份完成!"
    log "========================================="

    send_notification "success" "備份成功 (${BACKUP_TYPE}) - $(date '+%Y-%m-%d %H:%M')"
}

main "$@"
