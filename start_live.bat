@echo off
title Zoodle - Live Online Server
echo ===================================================
echo 🎨 Launching Zoodle Application & Live Cloudflare Tunnel
echo 📹 WhatsApp-Grade Video Conferencing + Multiplayer Scribble
echo ===================================================
set PATH=C:\Users\Dell\.gemini\antigravity\scratch\nodejs;%PATH%
cd /d "C:\Users\Dell\.gemini\antigravity\scratch\zoodle"

echo Starting local Node server...
start "Zoodle Node Server" "C:\Users\Dell\.gemini\antigravity\scratch\nodejs\node.exe" server.js

timeout /t 2 /nobreak >nul

echo Starting live public tunnel...
"C:\Users\Dell\.gemini\antigravity\scratch\tools\cloudflared.exe" tunnel --url http://localhost:3000
pause
