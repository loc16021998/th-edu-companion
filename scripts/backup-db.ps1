<#
  Sao lưu database TH EDU Companion về máy (Windows PowerShell).
  Cần: PostgreSQL client 17 (pg_dump) — https://www.postgresql.org/download/windows/ (chọn "Command Line Tools").

  Cách dùng:
    $env:SUPABASE_DB_URL = "postgresql://postgres.<ref>:<mật-khẩu>@aws-0-<region>.pooler.supabase.com:5432/postgres"
    powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1

  Kết quả: backups\th-edu-<ngày giờ>.dump (đã kiểm tra đọc được). File chứa dữ liệu cá nhân học sinh —
  cất ở ổ mã hoá (BitLocker) hoặc nén có mật khẩu, KHÔNG gửi qua Zalo/email, KHÔNG commit (đã có trong .gitignore).
#>
$ErrorActionPreference = "Stop"

if (-not $env:SUPABASE_DB_URL) { throw "Chưa đặt biến SUPABASE_DB_URL (xem đầu file)." }

$pgDump = (Get-Command pg_dump -ErrorAction SilentlyContinue).Source
if (-not $pgDump) {
  $pgDump = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $pgDump) { throw "Không tìm thấy pg_dump. Cài PostgreSQL Command Line Tools 17." }
$pgRestore = Join-Path (Split-Path $pgDump) "pg_restore.exe"

$root = Split-Path $PSScriptRoot -Parent
$dir = Join-Path $root "backups"
New-Item -ItemType Directory -Force $dir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$file = Join-Path $dir "th-edu-$stamp.dump"

Write-Host "Đang sao lưu bằng $pgDump ..."
& $pgDump $env:SUPABASE_DB_URL --format=custom --compress=9 --no-owner --no-privileges --schema=public --schema=auth --schema=storage --file=$file
if ($LASTEXITCODE -ne 0) { throw "pg_dump thất bại (mã $LASTEXITCODE)." }

# Bản sao lưu hỏng = không có sao lưu → kiểm tra đọc được và có các bảng chính
$toc = & $pgRestore --list $file
foreach ($t in "students", "attendance", "daily_reports", "fees", "profiles") {
  if (-not ($toc | Select-String -SimpleMatch "TABLE DATA public $t ")) { throw "Bản sao lưu thiếu dữ liệu bảng $t." }
}
$size = "{0:N1} MB" -f ((Get-Item $file).Length / 1MB)
Write-Host "Xong: $file ($size). Đã kiểm tra đọc được." -ForegroundColor Green
