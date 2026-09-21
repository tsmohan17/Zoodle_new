@echo off
title Zoodle - Scribble Game & Video Conferencing
echo ===================================================
echo 🎨 Launching Zoodle Application
echo 📹 WhatsApp-Grade Video Conferencing + Multiplayer Scribble
echo ===================================================
set PATH=C:\Users\Dell\.gemini\antigravity\scratch\nodejs;%PATH%
cd /d "C:\Users\Dell\.gemini\antigravity\scratch\zoodle"
echo Starting server on http://localhost:3000 ...
"C:\Users\Dell\.gemini\antigravity\scratch\nodejs\node.exe" server.js
pause
