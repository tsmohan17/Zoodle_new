@echo off
title Zoodle - Build Native Android Project
echo ===================================================
echo 🤖 Preparing Native Android Project with Capacitor
echo ===================================================
set PATH=C:\Users\Dell\.gemini\antigravity\scratch\nodejs;%PATH%
cd /d "C:\Users\Dell\.gemini\antigravity\scratch\zoodle"

echo [1/3] Installing Capacitor dependencies...
call "C:\Users\Dell\.gemini\antigravity\scratch\nodejs\npm.cmd" install @capacitor/core @capacitor/cli @capacitor/android --save-dev

echo.
echo [2/3] Adding Android platform...
call "C:\Users\Dell\.gemini\antigravity\scratch\nodejs\node.exe" node_modules/@capacitor/cli/bin/capacitor add android

echo.
echo [3/3] Syncing web assets and configs...
call "C:\Users\Dell\.gemini\antigravity\scratch\nodejs\node.exe" node_modules/@capacitor/cli/bin/capacitor sync android

echo.
echo ===================================================
echo ✅ Android Studio project is ready in:
echo C:\Users\Dell\.gemini\antigravity\scratch\zoodle\android
echo.
echo To open in Android Studio and build APK:
echo run: npx cap open android
echo ===================================================
pause
