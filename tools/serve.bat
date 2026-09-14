@echo off
chcp 65001 >nul
title naruto-auto 本地更新服务 (127.0.0.1:8899)
cd /d "%~dp0.."

echo ============================================
echo  naruto-auto 本地更新服务
echo  目录: %CD%
echo  地址: http://127.0.0.1:8899/naruto-auto.user.js
echo ============================================
echo.
echo 开着这个窗口，Tampermonkey 里点脚本的「检查更新」就能一键升级。
echo 关闭此窗口即停止服务（脚本已装的仍能正常运行）。
echo.

where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server 8899 --bind 127.0.0.1
) else (
  echo 未找到 python，尝试 py 启动器...
  py -3 -m http.server 8899 --bind 127.0.0.1
)
pause
