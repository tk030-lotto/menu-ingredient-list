@echo off
chcp 932 > nul
title 献立食材リスト 起動ランチャー

echo ========================================================
echo   献立食材リストを起動しています...
echo ========================================================
echo.

cd /d "%~dp0"

if exist "index.html" (
    echo ブラウザでツールを開きます...
    start "" "index.html"
    exit
) else (
    echo [エラー] index.html が見つかりません。
    echo ファイル構成を確認してください。
    echo.
    pause
    exit /b 1
)