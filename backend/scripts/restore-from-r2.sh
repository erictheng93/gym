#!/bin/bash
# ============================================
# Gym Nexus - 從 R2 恢復備份
# ============================================
# 用法: ./restore-from-r2.sh [backup_type] [date]
# 範例:
#   ./restore-from-r2.sh daily 20260129        # 恢復特定日期
#   ./restore-from-r2.sh daily latest          # 恢復最新備份
#   ./restore-from-r2.sh                       # 列出可用備份

set -euo pipefail

# ============================================
# 配置區
# ============================================
R2_REMOTE="r2"
R2_BUCKET="gym-nexus-backup"
DB_CONTAINER="backend-database-1"
RESTORE_DIR="/tmp/gym-restore-$(date +%s)"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

BACKUP_TYPE="${1:-}"
BACKUP_DATE="${2:-}"

log() {
    echo "${LOG_PREFIX} $1"
}

cleanup() {
    log "清理暫存目錄..."
    rm -rf "$RESTORE_DIR"
}

trap cleanup EXIT

list_backups() {
    echo "========================================="
    echo "可用備份列表"
    echo "========================================="

    for type in daily weekly manual; do
        echo ""
        echo "--- ${type} ---"
        rclone ls "${R2_REMOTE}:${R2_BUCKET}/${type}/" 2>/dev/null | grep "database_" | sort -r | head -10 || echo "  (無備份)"
    done

    echo ""
    echo "用法: $0 [daily|weekly|manual] [日期或 latest]"
    echo "範例: $0 daily 20260129"
    echo "範例: $0 daily latest"
}

find_backup_file() {
    local type="$1"
    local date="$2"
    local remote_path="${R2_REMOTE}:${R2_BUCKET}/${type}/"

    if [[ "$date" == "latest" ]]; then
        # 取得最新的備份
        rclone ls "$remote_path" 2>/dev/null | grep "database_" | sort -r | head -1 | awk '{print $2}'
    else
        # 搜尋特定日期
        rclone ls "$remote_path" 2>/dev/null | grep "database_${date}" | head -1 | awk '{print $2}'
    fi
}

download_backup() {
    local type="$1"
    local filename="$2"
    local remote_path="${R2_REMOTE}:${R2_BUCKET}/${type}/${filename}"

    log "下載備份: $remote_path"
    mkdir -p "$RESTORE_DIR"

    rclone copy "$remote_path" "$RESTORE_DIR/" --progress

    if [[ -f "${RESTORE_DIR}/${filename}" ]]; then
        log "下載完成: ${RESTORE_DIR}/${filename}"
        echo "${RESTORE_DIR}/${filename}"
    else
        log "錯誤: 下載失敗"
        exit 1
    fi
}

restore_database() {
    local backup_file="$1"

    log "========================================="
    log "警告: 即將覆蓋現有資料庫!"
    log "========================================="

    read -p "確定要繼續嗎? (輸入 'YES' 確認): " CONFIRM

    if [[ "$CONFIRM" != "YES" ]]; then
        log "取消恢復"
        exit 0
    fi

    log "開始恢復資料庫..."

    # 驗證備份檔案
    if ! gzip -t "$backup_file" 2>/dev/null; then
        log "錯誤: 備份檔案損壞"
        exit 1
    fi

    # 恢復資料庫
    gunzip -c "$backup_file" | docker exec -i "$DB_CONTAINER" psql \
        -U directus \
        -d gym_nexus \
        --single-transaction \
        --set ON_ERROR_STOP=on

    log "========================================="
    log "資料庫恢復完成!"
    log "========================================="
}

# ============================================
# 主程式
# ============================================

main() {
    # 沒有參數時列出可用備份
    if [[ -z "$BACKUP_TYPE" ]]; then
        list_backups
        exit 0
    fi

    # 驗證參數
    if [[ ! "$BACKUP_TYPE" =~ ^(daily|weekly|manual)$ ]]; then
        log "錯誤: 無效的備份類型 '$BACKUP_TYPE'"
        log "有效類型: daily, weekly, manual"
        exit 1
    fi

    if [[ -z "$BACKUP_DATE" ]]; then
        log "錯誤: 請指定日期或 'latest'"
        exit 1
    fi

    # 查找備份檔案
    log "搜尋備份..."
    BACKUP_FILE=$(find_backup_file "$BACKUP_TYPE" "$BACKUP_DATE")

    if [[ -z "$BACKUP_FILE" ]]; then
        log "錯誤: 找不到符合條件的備份"
        list_backups
        exit 1
    fi

    log "找到備份: $BACKUP_FILE"

    # 下載並恢復
    LOCAL_FILE=$(download_backup "$BACKUP_TYPE" "$BACKUP_FILE")
    restore_database "$LOCAL_FILE"
}

main "$@"
