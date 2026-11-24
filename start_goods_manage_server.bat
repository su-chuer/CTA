@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [錯誤] 找不到 Node.js，請先安裝 Node.js LTS 版本：https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo 正在安裝 express 套件...
  npm install
  if errorlevel 1 (
    echo [錯誤] npm install 失敗，請檢查網路連線或 npm 設定。
    pause
    exit /b 1
  )
)

echo 正在啟動庫存管理 JSON API 伺服器...
echo 啟動完成後請於瀏覽器開啟 http://localhost:3000/goodsmanage.html
echo 按 Ctrl + C 可停止伺服器
npm start
