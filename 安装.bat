@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
echo ================================
echo  dsh-feiyu-affinity 安装器（手动复制，不经过 pnpm）
echo ================================
echo.
echo 安装前请完全退出 DSH（托盘也要退出），否则可能失败。
echo.
set "PROFILE=%USERPROFILE%\.dsh\profiles\desktop"
if not "%~1"=="" set "PROFILE=%~1"
echo 目标 profile：!PROFILE!
echo.
if not exist "!PROFILE!" (
  echo [错误] 找不到 profile 目录：!PROFILE!
  echo 请确认 DSH 装过并启动过一次，或用参数指定：
  echo   安装.bat "C:\Users\你的名字\.dsh\profiles\desktop"
  pause
  exit /b 1
)
tasklist /FI "IMAGENAME eq DeepSeek Harness.exe" 2>nul | find /I "DeepSeek Harness.exe" >nul
if not errorlevel 1 (
  echo [警告] 检测到 DSH 还开着，安装可能失败（文件占用）。
  choice /C YN /M "要先继续吗"
  if errorlevel 2 exit /b 1
)
set "DEST=!PROFILE!\node_modules\dsh-feiyu-affinity"
echo.
echo 复制插件到：!DEST!
xcopy "%~dp0*" "!DEST!\" /E /I /Y /Q >nul
if errorlevel 1 (
  echo [错误] 复制失败，可能是 DSH 没关干净或权限不足。
  pause
  exit /b 1
)
echo 复制完成。
set "PATCH=!PROFILE!\cordis.patch.yml"
if exist "!PATCH!" (
  copy "!PATCH!" "!PATCH!.bak-dsh-feiyu-affinity" >nul
  findstr /C:"dsh-feiyu-affinity" "!PATCH!" >nul
  if errorlevel 1 (
    echo. >> "!PATCH!"
    type "%~dp0patch-snippet.yml" >> "!PATCH!"
    echo 已写入 cordis.patch.yml（原文件已备份）。
  ) else (
    echo cordis.patch.yml 里已有 dsh-feiyu-affinity 配置，跳过。
  )
) else (
  echo [提示] 没找到 cordis.patch.yml，请手动把 patch-snippet.yml 内容加进去。
)
echo.
echo 全部完成。现在重新打开 DSH 即可。
pause
