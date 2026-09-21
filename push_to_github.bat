@echo off
title Zoodle - Push to GitHub (Zoodle_new)
echo ===================================================
echo 🚀 Pushing Zoodle to https://github.com/tsmohan17/Zoodle_new.git
echo ===================================================
echo.
set PATH=C:\Users\Dell\.gemini\antigravity\scratch\tools\git\cmd;%PATH%
cd /d "C:\Users\Dell\.gemini\antigravity\scratch\zoodle"

git remote remove origin >nul 2>&1
git remote add origin https://github.com/tsmohan17/Zoodle_new.git
git branch -M main

echo Staging all files...
git add .
git commit -m "Deploy Zoodle with WhatsApp-grade video calling" >nul 2>&1

echo Pushing to GitHub...
git push -u origin main

echo.
echo ===================================================
echo If asked for credentials, sign in with GitHub in your browser window!
echo ===================================================
pause
