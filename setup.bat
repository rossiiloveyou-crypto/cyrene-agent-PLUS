@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo [Cyrene] 开始初始化...

echo [1/4] 安装依赖...
call pnpm install --frozen-lockfile
if errorlevel 1 (
    echo [错误] pnpm install 失败，请确认已安装 pnpm 10.33.0。
    pause
    exit /b 1
)

echo [2/4] 构建原生截图助手...
call pnpm run build:screenshot-helper
if errorlevel 1 (
    echo [错误] build:screenshot-helper 失败
    pause
    exit /b 1
)

echo [3/4] 构建项目...
call pnpm run build
if errorlevel 1 (
    echo [错误] pnpm run build 失败
    pause
    exit /b 1
)

echo [4/4] 链接 cyrene 命令...
call pnpm link --global
if errorlevel 1 (
    echo [错误] pnpm link --global 失败
    pause
    exit /b 1
)

echo.
echo [Cyrene] 初始化完成，可以双击 start.bat 启动。
pause
