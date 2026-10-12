# Cyrene 用户数据迁移脚本
# 作用：把旧数据目录 %APPDATA%\live2d-cyrene 的数据搬到新目录 %APPDATA%\Cyrene
# 场景：应用内自动迁移失败时的手动兜底。双击同目录的 migrate-user-data.cmd 即可运行。
# 规则：旧数据优先覆盖新目录同名文件；lockfile 等运行时文件保留新目录版本；
#       任何文件搬不动都会留在旧目录，不会丢数据，可重跑本脚本重试。

$ErrorActionPreference = 'Stop'
$appData = [Environment]::GetFolderPath('ApplicationData')
$legacy = Join-Path $appData 'live2d-cyrene'
$target = Join-Path $appData 'Cyrene'
$runtimeFiles = @('lockfile', 'SingletonLock', 'SingletonSocket', 'SingletonCookie')

Write-Host "== Cyrene 用户数据迁移 ==" -ForegroundColor Cyan
Write-Host "旧目录: $legacy"
Write-Host "新目录: $target"
Write-Host ""

if (-not (Test-Path -LiteralPath $legacy)) {
    Write-Host "未发现旧数据目录，无需迁移。" -ForegroundColor Green
    exit 0
}

$running = Get-Process -Name 'Cyrene' -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "Cyrene 正在运行，文件会被占用。请先完全退出 Cyrene（含托盘图标）再运行本脚本。" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath $target)) {
    Move-Item -LiteralPath $legacy -Destination $target
    Write-Host "迁移完成：旧目录已整体移动到新目录。" -ForegroundColor Green
    exit 0
}

# 两者并存：逐项搬入，旧数据优先
foreach ($entry in Get-ChildItem -LiteralPath $legacy -Force) {
    if ($runtimeFiles -contains $entry.Name) {
        # 陈旧的运行时文件直接丢弃，保住新目录里已有的版本
        Remove-Item -LiteralPath $entry.FullName -Recurse -Force -ErrorAction SilentlyContinue
        continue
    }
    $dest = Join-Path $target $entry.Name
    if (Test-Path -LiteralPath $dest) {
        Remove-Item -LiteralPath $dest -Recurse -Force
    }
    Move-Item -LiteralPath $entry.FullName -Destination $dest
}

# 旧目录搬空后删除；仍有残留说明有文件被占用，保留待下次重试
$leftover = Get-ChildItem -LiteralPath $legacy -Force -ErrorAction SilentlyContinue
if (-not $leftover) {
    Remove-Item -LiteralPath $legacy -Force
    Write-Host "迁移完成：旧目录数据已全部并入新目录。" -ForegroundColor Green
} else {
    Write-Host "部分文件未能迁移（被其他程序占用），已保留在旧目录，关闭占用程序后重跑本脚本即可。" -ForegroundColor Yellow
    $leftover | ForEach-Object { Write-Host "  - $($_.Name)" }
}
