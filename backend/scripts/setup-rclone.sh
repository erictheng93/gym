#!/bin/bash
# ============================================
# Rclone R2 設定輔助腳本
# ============================================
# 用法: ./setup-rclone.sh
#
# 執行前請先準備:
# 1. Cloudflare Account ID
# 2. R2 Access Key ID
# 3. R2 Secret Access Key
#
# 在 Cloudflare Dashboard 取得:
# R2 > Overview > Manage R2 API Tokens > Create API Token

set -euo pipefail

echo "========================================="
echo "Rclone R2 設定精靈"
echo "========================================="

# 檢查 rclone 是否安裝
if ! command -v rclone &> /dev/null; then
    echo "rclone 未安裝，正在安裝..."
    curl https://rclone.org/install.sh | sudo bash
fi

echo ""
echo "請輸入 Cloudflare R2 資訊:"
echo "(可在 Cloudflare Dashboard > R2 > Manage R2 API Tokens 取得)"
echo ""

read -p "Cloudflare Account ID: " CF_ACCOUNT_ID
read -p "R2 Access Key ID: " R2_ACCESS_KEY
read -sp "R2 Secret Access Key: " R2_SECRET_KEY
echo ""

# 建立 rclone 配置
RCLONE_CONFIG_PATH="${HOME}/.config/rclone/rclone.conf"
mkdir -p "$(dirname "$RCLONE_CONFIG_PATH")"

# 檢查是否已存在 r2 配置
if grep -q "^\[r2\]" "$RCLONE_CONFIG_PATH" 2>/dev/null; then
    echo ""
    read -p "已存在 r2 配置，是否覆蓋? (y/N): " OVERWRITE
    if [[ "$OVERWRITE" != "y" && "$OVERWRITE" != "Y" ]]; then
        echo "取消設定"
        exit 0
    fi
    # 移除舊配置
    sed -i '/^\[r2\]/,/^\[/{ /^\[r2\]/d; /^\[/!d; }' "$RCLONE_CONFIG_PATH"
fi

# 寫入新配置
cat >> "$RCLONE_CONFIG_PATH" <<EOF

[r2]
type = s3
provider = Cloudflare
access_key_id = ${R2_ACCESS_KEY}
secret_access_key = ${R2_SECRET_KEY}
endpoint = https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com
acl = private
EOF

echo ""
echo "========================================="
echo "配置完成!"
echo "========================================="

# 測試連接
echo ""
echo "測試 R2 連接..."
if rclone lsd r2: &> /dev/null; then
    echo "✅ 連接成功!"
    echo ""
    echo "現有 Buckets:"
    rclone lsd r2:
else
    echo "❌ 連接失敗，請檢查憑證"
    exit 1
fi

# 詢問是否建立 bucket
echo ""
read -p "是否建立備份用的 bucket 'gym-nexus-backup'? (y/N): " CREATE_BUCKET

if [[ "$CREATE_BUCKET" == "y" || "$CREATE_BUCKET" == "Y" ]]; then
    if rclone mkdir r2:gym-nexus-backup; then
        echo "✅ Bucket 'gym-nexus-backup' 建立成功!"
    else
        echo "Bucket 可能已存在或建立失敗"
    fi
fi

echo ""
echo "========================================="
echo "設定完成! 接下來可以:"
echo "========================================="
echo "1. 測試備份: ./backup-to-r2.sh manual"
echo "2. 設定 crontab 自動備份:"
echo "   0 3 * * * /opt/gym/scripts/backup-to-r2.sh daily"
echo "   0 4 * * 0 /opt/gym/scripts/backup-to-r2.sh weekly"
echo ""
