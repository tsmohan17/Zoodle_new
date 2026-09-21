@echo off
title Zoodle - Push to GitHub for 24/7 Cloud Deployment
echo ===================================================
echo 🚀 Setup and Push Zoodle to GitHub
echo ===================================================
echo.
set PATH=C:\Users\Dell\.gemini\antigravity\scratch\tools\git\cmd;%PATH%

cd /d "C:\Users\Dell\.gemini\antigravity\scratch\zoodle"

echo [1/4] Checking Git...
git --version
if errorlevel 1 (
  echo Git was not found!
  pause
  exit /b 1
)

echo.
echo [2/4] Initializing Git repository...
if not exist ".git" (
  git init -b main
)

git config user.name "Zoodle Developer" >nul 2>&1
git config user.email "dev@zoodle.game" >nul 2>&1

echo.
echo [3/4] Staging and committing files...
git add .
git commit -m "Deploy Zoodle with WhatsApp-grade video conferencing"

echo.
echo ===================================================
echo Next step: Create a new repository on GitHub:
echo 1. Open https://github.com/new
echo 2. Name your repo: zoodle
echo 3. Leave it Public (or Private) and DO NOT check "Add a README"
echo 4. Copy the repository URL (e.g. https://github.com/YourUsername/zoodle.git)
echo ===================================================
echo.
set /p REPO_URL="Enter your GitHub Repository URL: "

if "%REPO_URL%"=="" (
  echo No repository URL entered. Exiting.
  pause
  exit /b 1
)

echo.
echo [4/4] Pushing to GitHub (%REPO_URL%)...
git remote remove origin >nul 2>&1
git remote add origin %REPO_URL%
git branch -M main
git push -u origin main

echo.
echo ===================================================
echo 🎉 Code successfully pushed to GitHub!
echo.
echo Now deploy to Render for free 24/7 hosting:
echo 1. Open https://render.com and sign in with GitHub
echo 2. Click "New +" -> "Web Service"
echo 3. Select your "zoodle" repository
echo 4. Click "Deploy Web Service"!
echo Render will automatically run and give you a permanent URL like:
echo https://zoodle.onrender.com
echo ===================================================
pause
