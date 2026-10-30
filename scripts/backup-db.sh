#!/usr/bin/env bash
# Sao lưu database TH EDU Companion (Linux / macOS). Cần pg_dump 17.
#   SUPABASE_DB_URL="postgresql://..." bash scripts/backup-db.sh
# Kết quả: backups/th-edu-<ngày giờ>.dump — chứa dữ liệu cá nhân học sinh, cất ở nơi mã hoá.
set -euo pipefail
: "${SUPABASE_DB_URL:?Chưa đặt SUPABASE_DB_URL}"
cd "$(dirname "$0")/.."
mkdir -p backups
FILE="backups/th-edu-$(TZ=Asia/Ho_Chi_Minh date +%Y-%m-%d_%H%M).dump"
pg_dump "$SUPABASE_DB_URL" --format=custom --compress=9 --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage --file="$FILE"
TOC=$(pg_restore --list "$FILE")
for t in students attendance daily_reports fees profiles; do
  grep -q "TABLE DATA public $t " <<<"$TOC" || { echo "Bản sao lưu thiếu dữ liệu bảng $t" >&2; exit 1; }
done
echo "Xong: $FILE ($(du -h "$FILE" | cut -f1)). Đã kiểm tra đọc được."
